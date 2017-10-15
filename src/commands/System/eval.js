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
      usage: '[-dl|-ld|-ds|-sd] [-d|--delete] [-l|--log] [-s|--silent] <expression:str> [...]',
      usageDelim: ' ',
      extendedHelp: `Flags:
-d, --delete  delete the command message
-l, --log     send the result to the console instead of Discord; cannot be combined with -d
-s, --silent  eval the code without showing the result; cannot be combined with -l`,
    })

    // The depth to inspect the evaled output to, if it's not a string
    this.inspectionDepth = 0
    // this.getTypeStr shouldn't recurse more than once, but just in case
    this.typeRecursionLimit = 2
    // How long to wait for promises to resolve
    this.timeout = 10000
    // The number of lines before the output is considered overly long
    this.tooManyLines = 7
    // The approx. number of chars per line in a codeblock on Android, on a Google Pixel XL
    this.mobileCharsPerLine = 34

    // How the evaled result is outputted
    this.outputTo = {
      channel: (msg, topLine, evaled) => msg.send(`\`${topLine}\`\n${this.client.methods.util.codeBlock('js', this.client.methods.util.clean(evaled))}`),
      log: (msg, topLine, evaled) => this.client.emit('log', `${topLine}\n${evaled}`),
      upload: (msg, topLine, evaled) => msg.channel.send(`\`${topLine}\``, new MessageAttachment(Buffer.from(`// ${topLine}\n${evaled}`), 'eval.js')),
    }
  }

  async run (msg, [mult, d, l, s, ...code]) {
    mult = mult || ''
    const flags = {
      delete: Boolean(d) || mult.includes('d'),
      log: Boolean(l) || mult.includes('l'),
      silent: Boolean(s) || mult.includes('s'),
    }
    code = code.join(' ')

    if (flags.delete) msg.delete()

    try {
      const [evaled, topLine] = await this.handleEval(flags, code, /* for the eval: */ msg)

      if (flags.log) return this.outputTo.log(msg, topLine, evaled)

      if (this.isTooLong(evaled, topLine)) {
        return this.sendTooLongQuery(msg, topLine, evaled,
          'Output is too long. Log it to console instead? Or `truncate` it or `upload` it as a file?',
          { yes: 'log' })
      }

      const is = this.isKindaLong(evaled, topLine)
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

  async handleEval (flags, code, /* for the eval: */ msg) {
    const start = now()
    const evaledOriginal = eval(code) // eslint-disable-line no-eval
    const syncEnd = now()
    const evaledTimeout = this.timeoutPromise(evaledOriginal)
    let evaledValue = await evaledTimeout // awaiting a non-promise returns the non-promise
    const asyncEnd = now()

    const evaledIsThenable = this.isThenable(evaledOriginal)

    // We're doing this checking here so it's not counted in the performance-now timeing
    // And if the promise timed out, just show the promise
    if (!evaledIsThenable || evaledValue instanceof TimeoutError) evaledValue = evaledOriginal

    const time = evaledIsThenable
      ? `${this.getNiceDuration(syncEnd - start)} ➡ ${this.getNiceDuration(asyncEnd - syncEnd)}`
      : `${this.getNiceDuration(syncEnd - start)}`

    if (flags.silent) return [evaledValue]

    const topLine = `${await this.getTypeStr(
      evaledOriginal,
      evaledIsThenable ? evaledTimeout : null
    )}, ${time}`

    if (typeof evaledValue !== 'string') evaledValue = inspect(evaledValue, { depth: this.inspectionDepth })

    return [evaledValue, topLine]
  }

  isTooLong (evaled, topLine) {
    // 1988 is 2000 - 12 (the chars that are added, "`...`\n```js\n...```")
    return evaled.length > 1988 - topLine.length
  }

  isKindaLong (evaled, topLine) {
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

  async getTypeStr (value, awaitedPromise = null, i = 0) {
    if (!this.isThenable(value)) assert(!awaitedPromise, '`value` was not a promise, but a surrogate, already-awaited promise was still passed')
    if (awaitedPromise) assert(typeof awaitedPromise === 'object' && awaitedPromise instanceof Promise, '`awaitedPromise` was provided, but it was not a promise')
    assert(typeof i === 'number' && i >= 0)

    if (value instanceof TimeoutError) return `but it didn't resolve in ${this.getNiceDuration(this.timeout)}`

    const basicType = typeof value
    if (basicType === 'object') {
      // The typeof operator mistakenly calls `null` an object
      if (value === null) return 'null primitive'

      let objType = value.constructor.name
      if (this.isThenable(value)) { // a promise, or more precisely, a thenable
        if (objType !== 'Promise') objType += ' promise'
        return i <= this.typeRecursionLimit
          // But we're gonna await the already-awaited promise, for efficiency
          ? `awaited ${objType} object ➡ ${await this.getTypeStr(await awaitedPromise, null, i + 1)}`
          : `${objType} object`
      } else if (value instanceof Boolean || value instanceof Number || value instanceof String) {
        return `${objType} object (not a primitive!)`
      }

      if (objType === 'Object') objType = 'plain'
      return `${objType} object`
    } else if (basicType === 'function') {
      const objType = value.constructor.name
      return objType === 'Function'
        ? `${basicType} object`
        : `${objType} ${basicType} object`
    }

    return `${basicType} primitive`
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

  timeoutPromise (promise) {
    return Promise.race([promise, sleep(this.timeout, new TimeoutError('Promise timed out'))])
  }
}

class TimeoutError extends Error {}
