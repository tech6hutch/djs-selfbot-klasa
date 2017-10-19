const assert = require('assert')
const now = require('performance-now')
const { MessageAttachment } = require('discord.js')
const { Command, util: { sleep } } = require('klasa')
const { inspect } = require('util')

module.exports = class extends Command {
  constructor (...args) {
    super(...args, {
      aliases: ['ev'],
      permLevel: 10,
      description: 'Evaluates arbitrary JavaScript. Reserved for bot owner.',
      usage: '<expression:str>',
      extendedHelp: `Flags:

-d, --delete
        delete the command message

--depth=DEPTH
        the number of times to recurse while formatting the result; default 0

-l, --log
        send the result to the console instead of Discord; cannot be combined with -s (overridden by -o)

-p, --no-await
        don't await the result if it's a promise

-o, --output-to=[WHERE]
        output the result to WHERE; WHERE can be 'channel' (default), 'log' (-l), 'upload', or 'none' / '' (-s); if provided, -l and -s are ignored

-s, --silent
        eval the code without showing the result; cannot be combined with -l (overridden by -o)

-w, --wait=TIME
        time in milliseconds to await promises; default is 10000`,
    })

    // this.shortFlags = {
    //   d: 'delete',
    //   l: 'log',
    //   p: 'noAwait',
    //   o: 'outputTo',
    //   s: 'silent',
    //   w: 'wait',
    // }

    // this.longFlags = {
    //   delete: 'delete',
    //   depth: 'depth',
    //   log: 'log',
    //   'no-await': 'noAwait',
    //   'output-to': 'outputTo',
    //   silent: 'silent',
    //   wait: 'wait',
    // }

    this.defaults = {
      // The depth to inspect the evaled output to, if it's not a string
      depth: 0,
      // How long to wait for promises to resolve
      wait: 10000,
    }

    // The depth to inspect the evaled output to, if it's not a string
    // this.inspectionDepth = 0
    // this.getTypeStr shouldn't recurse more than once, but just in case
    this.typeRecursionLimit = 2
    // How long to wait for promises to resolve
    // this.timeout = 10000
    // The number of lines before the output is considered overly long
    this.tooManyLines = 7
    // The approx. number of chars per line in a codeblock on Android, on a Google Pixel XL
    this.mobileCharsPerLine = 34

    // How the evaled result is outputted
    this.outputTo = {
      channel: (msg, topLine, evaled) => msg.send(`\`${topLine}\`\n${this.client.methods.util.codeBlock('js', this.client.methods.util.clean(evaled))}`),
      log: (msg, topLine, evaled) => this.client.emit('log', `${topLine}\n${evaled}`),
      upload: (msg, topLine, evaled) => msg.channel.send(`\`${topLine}\``, new MessageAttachment(Buffer.from(`// ${topLine}\n${evaled}`), 'eval.js')),
      none: async () => null,
    }
  }

  async run (msg, [argStr]) {
    assert(typeof argStr === 'string')

    const [ givenFlags, code ] = this.parseArgs(argStr)

    const flags = {
      delete: Boolean(givenFlags.delete || givenFlags.d),
      depth: parseInt(givenFlags.depth || this.defaults.depth, 10),
      // log: Boolean(givenFlags.log || givenFlags.l),
      noAwait: Boolean(givenFlags['no-await'] || givenFlags.p),
      // silent: Boolean(givenFlags.silent || givenFlags.s),
      outputTo: [ givenFlags['output-to'], givenFlags.o ].find(f => f in this.outputTo) ||
        (givenFlags.log || givenFlags.l ? 'log' : '') ||
        (givenFlags.silent || givenFlags.s ? 'none' : '') ||
        'channel',
      wait: parseInt(givenFlags.wait || givenFlags.w || this.defaults.wait, 10),
    }

    // return msg.send(`flags: ${inspect(flags)}\ncode: ${inspect(code)}`)

    // argStr.split(' ')
    // this.client.console.log('all args:', inspect(arguments))
    // this.client.console.log('raw args:', inspect({ mult, d, l, p, s, code }))
    // mult = mult[0] || ''
    // // use somewhere, idk: ^-[a-z]+$/
    // const flags = {
    //   delete: Boolean(d) || mult.includes('d'),
    //   log: Boolean(l) || mult.includes('l'),
    //   noAwait: Boolean(p) || mult.includes('p'),
    //   silent: Boolean(s) || mult.includes('s'),
    // }
    // code = code.join(' ')
    // this.client.console.log(inspect({ flags, code }))

    if (flags.delete) msg.delete()

    try {
      const [evaled, topLine] = await this.handleEval(flags, code, /* for the eval: */ msg)

      if (flags.outputTo === 'log') return this.outputTo.log(msg, topLine, evaled)
      if (flags.outputTo === 'upload') return this.outputTo.upload(msg, topLine, evaled)

      if (this.isTooLong(evaled, topLine)) {
        return this.sendTooLongQuery(msg, topLine, evaled,
          'Output is too long. Log it to console instead? Or `truncate` it or `upload` it as a file?',
          { yes: 'log' })
      }

      const is = this.isKindaLong(evaled)
      if (is.kindaLong) {
        return this.sendTooLongQuery(msg, topLine, evaled,
          is.becauseOfWrapping
            ? `The output is long (${is.lineCount} lines, plus wrapping on small screens). Send it anyway? Or \`truncate\` it and send it, or \`log\` it to console, or \`upload\` it as a file.`
            : `The output is long (${is.lineCount} lines). Send it anyway? Or \`truncate\` it and send it, or \`log\` it to console, or \`upload\` it as a file.`,
          { yes: 'channel' })
      }

      return this.outputTo.channel(msg, topLine, evaled)
    } catch (error) {
      if (flags.silent) return
      if (error && error.stack) this.client.emit('error', error.stack)
      if (flags.log) return
      return msg.send(`\`ERROR\`\n${this.client.methods.util.codeBlock('js', this.client.methods.util.clean(error))}`)
    }
  }

  parseArgs (argStr) {
    assert(typeof argStr === 'string')
    const flagRegex = /^(--?)([a-z-]+)(=[a-z\d]*)?$/
    const args = String(argStr).split(' ')
    const codeIndex = args.findIndex((arg, i) => !flagRegex.test(arg) || arg === '--code')
    const argFlags = args.slice(0, codeIndex)
    const givenFlags = {}
    for (let argIndex = 0; argIndex < argFlags.length; argIndex++) {
      assert(typeof argFlags[argIndex] === 'string')
      assert(flagRegex.exec(argFlags[argIndex]))

      const [ , hyphen, flagName, value ] = flagRegex.exec(argFlags[argIndex])
      assert(flagRegex.exec(argFlags[argIndex])[0] === argFlags[argIndex])
      assert(typeof hyphen === 'string' && typeof flagName === 'string')
      assert(hyphen === '-' || hyphen === '--')
      assert(flagName.length > 0)
      if (value) assert(value[0] === '=')
      this.client.console.log(inspect({ hyphen, flagName, value }))

      if (hyphen === '-') {
        for (let i = 0; i < flagName.length; i++) {
          assert(typeof flagName[i] === 'string')
          givenFlags[flagName[i]] = value ? value.slice(1) : true
        }
      } else if (hyphen === '--') {
        assert(flagName !== 'code')
        givenFlags[flagName] = value ? value.slice(1) : true
      } else assert(false, 'Something has gone horribly wrong if this runs')
    }

    return [
      givenFlags,
      args.slice(args[codeIndex] === '--code' && codeIndex + 1 < args.length
        ? codeIndex + 1
        : codeIndex).join(' '),
    ]

    // for (arg = args.shift(); args.length > 0 && arg.startsWith('-'); arg = args.shift()) {
    //   assert(typeof arg === 'string')

    //   const argMatches = /^(--?)([a-z-]+)(=[a-z\d]*)?$/.exec(arg)
    //   this.client.console.log('argMatches:', inspect(argMatches))
    //   if (!argMatches) break
    //   const [ _, hyphen, flagName, value ] = argMatches
    //   assert(_ === arg)
    //   assert(typeof hyphen === 'string' && typeof flagName === 'string')
    //   assert(hyphen === '-' || hyphen === '--')
    //   assert(flagName.length > 0)
    //   if (value) assert(value[0] === '=')

    //   this.client.console.log(inspect({ hyphen, flagName, value }))
    //   if (hyphen === '-') {
    //     for (let i = 0; i < flagName.length; i++) {
    //       assert(typeof flagName[i] === 'string')
    //       if (!(flagName[i] in this.shortFlags)) throw msg.sendCode('', `Error: Invalid flag "${flagName[i]}"`)
    //       flags[this.shortFlags[flagName[i]]] = value ? value.slice(1) : true
    //     }
    //   } else if (hyphen === '--') {
    //     if (flagName === 'code') {
    //       arg = ''
    //       break
    //     }
    //     if (!(flagName in this.longFlags)) throw msg.sendCode('', `Error: Invalid flag "${flagName}"`)
    //     flags[this.longFlags[flagName]] = value ? value.slice(1) : true
    //   } else {
    //     assert(false, 'Something has gone horribly wrong if this runs, since I even fecking asserted for this earlier')
    //   }
    // }

    // return [ flags, [arg, ...args].join(' ') ]
  }

  async handleEval (flags, code, /* for the eval: */ msg) {
    const start = now()
    const evaledOriginal = eval(code) // eslint-disable-line no-eval
    const syncEnd = now()
    const evaledTimeout = this.timeoutPromise(evaledOriginal, flags.wait)
    // Awaiting a non-promise returns the non-promise
    let evaledValue = flags.noAwait ? evaledOriginal : await evaledTimeout
    const asyncEnd = now()

    const evaledIsThenable = this.isThenable(evaledOriginal)

    // We're doing this checking here so it's not counted in the performance-now timeing
    // And if the promise timed out, just show the promise
    if (!evaledIsThenable || evaledValue instanceof TimeoutError) evaledValue = evaledOriginal

    const time = evaledIsThenable && !flags.noAwait
      ? `⏱${this.getNiceDuration(syncEnd - start)}<${this.getNiceDuration(asyncEnd - syncEnd)}>`
      : `⏱${this.getNiceDuration(syncEnd - start)}`

    if (flags.outputTo === 'none') return [evaledValue]

    const topLine = `${await this.getTypeStr(
      flags,
      evaledOriginal,
      evaledIsThenable ? evaledTimeout : null
    )} ${time}`

    if (typeof evaledValue !== 'string') evaledValue = inspect(evaledValue, { depth: flags.depth })

    return [evaledValue, topLine]
  }

  isTooLong (evaled, topLine) {
    // 1988 is 2000 - 12 (the chars that are added, "`...`\n```js\n...```")
    return evaled.length > 1988 - topLine.length
  }

  isKindaLong (evaled) {
    const lines = String(evaled).split('\n')
    const lineCount = lines.length

    if (lineCount < this.tooManyLines) {
      // It's not long in line-length alone, but what if we take line wrapping into account on small screens?
      const lineCountWithWrapping = lines.reduce(
        // The line length is divided by this.mobileCharsPerLine, rounded up, to see about how many lines
        // it will be on mobile screens.
        (count, line) => count + Math.ceil(line.length / this.mobileCharsPerLine),
        // We have to start with a `count` of 0 for the function to work.
        0
      )
      return {
        lineCount: lineCountWithWrapping,
        kindaLong: lineCountWithWrapping >= this.tooManyLines,
        becauseOfWrapping: true,
      }
    }

    return {
      lineCount,
      kindaLong: lineCount >= this.tooManyLines,
      becauseOfWrapping: false,
    }
  }

  async getTypeStr (flags, value, awaitedPromise = null, i = 0) {
    if (!this.isThenable(value)) assert(!awaitedPromise, '`value` was not a promise, but a surrogate, already-awaited promise was still passed')
    if (awaitedPromise) assert(typeof awaitedPromise === 'object' && awaitedPromise instanceof Promise, '`awaitedPromise` was provided, but it was not a promise')
    assert(typeof i === 'number' && i >= 0)

    // if (value instanceof TimeoutError) return `but it didn't resolve in ${this.getNiceDuration(flags.wait)}`
    if (value instanceof TimeoutError) return '?'

    const {basicType, type} = this.getComplexType(value)
    if (basicType === 'object' /* || basicType === 'function' */) {
      if (this.isThenable(value)) {
        return i <= this.typeRecursionLimit && !flags.noAwait
          // But we're gonna await the already-awaited promise, for efficiency
          ? `${type}<${await this.getTypeStr(flags, await awaitedPromise, null, i + 1)}>`
          : `${type}<?>`
      }
      if (Array.isArray(value)) return `${type}<${this.getArrayType(value)}>`
      if (value instanceof Map) return `${type}<${this.getMapType(value)}>`
      if (value instanceof Set) return `${type}<${this.getSetType(value)}>`
      return `${type}<${this.getObjectType(value)}>`
    }
    return type
  }

  getType (value) {
    if (value == null) return String(value)
    return typeof value
  }
  getClass (value) {
    return value && value.constructor && value.constructor.name
      ? value.constructor.name
      : {}.toString.call(value).match(/\[object (\w+)\]/)[1]
  }
  getComplexType (value) {
    const basicType = this.getType(value)
    if (basicType === 'object' || basicType === 'function') return {basicType, type: this.getClass(value)}
    return {basicType, type: basicType}
  }

  getArrayType (array, i = 0) {
    assert(Array.isArray(array))
    return this._getObjType(array, i)
  }
  getObjectType (obj, i = 0) {
    assert(this.getComplexType(obj).basicType === 'object')
    const type = this._getObjType(Object.values(obj), i)
    return type.length > 0 ? `${this.getComplexType('').type}, ${type}` : ''
  }
  getMapType (map, i = 0) {
    assert(this.getComplexType(map).basicType === 'object')
    const keyType = this._getObjType(Array.from(map.keys()), i)
    const valueType = this._getObjType(Array.from(map.values()), i)
    return valueType.length > 0 ? `${keyType}, ${valueType}` : ''
  }
  getSetType (set, i = 0) {
    assert(this.getComplexType(set).basicType === 'object')
    return this._getObjType(Array.from(set.values()), i)
  }
  _getObjType (values, i) {
    assert(Array.isArray(values))
    if (typeof i !== 'number') throw new TypeError('`i` is missing')
    // Collections have useful methods, which work on Sets.
    const Coll = this.client.methods.Collection.prototype

    const objTypes = new Set(values.map(v => this.getComplexType(v).type))
    const nonNullTypes = new Set()
    const nullTypes = new Set()
    for (const type of objTypes.values()) {
      assert(typeof type === 'string')
      if (['null', 'undefined'].includes(type)) nullTypes.add(type)
      else nonNullTypes.add(type)
    }

    if (nonNullTypes.size > 1) return '*'
    if (nonNullTypes.size === 1) {
      const type = Coll.first.call(nonNullTypes)
      const value = values.find(v => v != null)
      assert(value)
      this.client.console.log(value)
      const nestedType = this.getComplexType(value)
      let nestedTypeStr = ''
      if (nestedType.basicType === 'object' && i < this.typeRecursionLimit) {
        /**
         * @todo Handle some specific object types, like Map and Set
         */
        if (Array.isArray(value)) nestedTypeStr = `<${this.getArrayType(value, i + 1)}>`
        if (value instanceof Map) nestedTypeStr = `<${this.getMapType(value, i + 1)}>`
        if (value instanceof Set) nestedTypeStr = `<${this.getSetType(value, i + 1)}>`
        else nestedTypeStr = `<${this.getObjectType(value, i + 1)}>`
      }
      if (nullTypes.size > 0) return `?${type}${nestedTypeStr}`
      return `${type}${nestedTypeStr}`
    }
    assert(nonNullTypes.size === 0)

    // No types besides, possibly, "null" and "undefined"
    if (nullTypes.size > 1) { /* I dunno what to do, honestly */ }
    if (nullTypes.size === 1) return Coll.first.call(nullTypes)
    assert(nullTypes.size === 0)

    // No types at all, i.e. no elements at all
    assert(objTypes.size === 0)
    return ''
  }

  getNiceDuration (time) {
    if (time >= 1000) return `${(time / 1000).toFixed(2)}s`
    if (time >= 1) return `${time.toFixed(2)}ms`
    return `${(time * 1000).toFixed(2)}μs`
  }

  async sendTooLongQuery (cmdMsg, topLine, evaled, question, options) {
    const queryMsg = await cmdMsg.channel.send(`${question} (10s til auto-cancel)`)
    try {
      const collected = await cmdMsg.channel.awaitMessages(
        m => m.author.id === cmdMsg.author.id,
        { max: 1, time: 10000, errors: ['time'] }
      )
      const m = collected.first()
      queryMsg.delete()
      m.delete()

      const text = m.content.toLowerCase()
      if (text.startsWith('y')) { // whatever the yes option says to do
        return this.outputTo[options.yes](queryMsg, topLine, evaled)
      } else if (text.startsWith('l')) { // log to console
        return this.outputTo.log(queryMsg, topLine, evaled)
      } else if (text.startsWith('u')) { // upload as a file attachment and send to channel
        return this.outputTo.upload(queryMsg, topLine, evaled)
      } else if (text.startsWith('t')) { // truncate and send to channel
        // Truncate the evaled output, both its # of lines and each line's length
        const evaledLines = evaled.split('\n')
        const newLength = this.tooManyLines - 1
        const lastIndex = newLength - 1
        for (let i = 0; i < evaledLines.length; i++) {
          const line = evaledLines[i]
          if (i >= newLength) delete evaledLines[i]
          else if (i === lastIndex) evaledLines[i] = '...'
          else if (line.length > this.mobileCharsPerLine) evaledLines[i] = `${line.substr(0, this.mobileCharsPerLine - 3)}...`
        }
        return this.outputTo.channel(queryMsg, topLine, evaledLines.join('\n'))
      }
    } catch (error) {
      queryMsg.delete()
    }
  }

  isThenable (value) {
    return value && typeof value.then === 'function'
  }

  timeoutPromise (promise, timeout) {
    return Promise.race([promise, sleep(timeout, new TimeoutError('Promise timed out'))])
  }
}

class TimeoutError extends Error {}
