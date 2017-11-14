const assert = require('assert')
const { util: { sleep } } = require('klasa')

/**
 * @param {*} arg The value passed to the functions
 * @param {Function} f A function
 * @returns {*}
 */
const composeReduce = function (arg, f) {
  return f.call(this, arg)
}

/**
 * Threads the expr through the forms
 * @param {boolean} first Whether threading first (true) or last (false)
 * @param {*} x The value to thread
 * @param {Array<Function|Map|Array>} forms An array of functions, maps, and/or arrays.
 *  Functions are called with x. Maps have x passed to their "get" method.
 *  Arrays must begin with a function or a map. If an array begins with a function, the rest of the
 *  array (if there are any more elements) are passed before/after x. If an array begins with a
 *  map, if there's a second element, it's used as a default in case x is not in the map.
 * @returns {*} x, after it has been passed thru the forms
 */
const thread = function thread (first, x, ...forms) {
  console.log('thread called with:', { first, x, forms })
  if (forms.length === 0) return x

  const form = forms[0]
  const [fn, ...args] = Array.isArray(form)
    ? first ? [form[0], x, ...form.slice(1)] : [form[0], ...form.slice(1), x]
    : [form, x]
  return thread.call(this,
    first,
    typeof fn === 'function'
      ? fn.apply(this, args)
      : (typeof fn.get === 'function' && fn.get(x)) || forms.slice(1).find(v => v !== undefined),
    ...forms.slice(1))
}

/**
 * Contains static methods used throughout the bot
 */
class SelfbotUtil {
  /**
   * This class may not be initiated with new
   */
  constructor () {
    throw new Error('This class may not be initiated with new')
  }

  /**
   * Get the type of value. A better version of the `typeof` operator, basically
   * @param {*} value The object or primitive whose type is to be returned
   * @returns {string}
   */
  static getType (value) {
    if (value == null) return String(value)
    return typeof value
  }

  /**
   * Get the class (constructor) name of value
   * @param {*} value The object whose class name is to be returned
   * @returns {string}
   */
  static getClass (value) {
    return value && value.constructor && value.constructor.name
      ? value.constructor.name
      : {}.toString.call(value).match(/\[object (\w+)\]/)[1]
  }

  /**
   * Get the type info for value
   * @param {*} value The object or primitive whose complex type is to be returned
   * @returns {{basicType: string, type: string}}
   */
  static getComplexType (value) {
    const basicType = SelfbotUtil.getType(value)
    if (basicType === 'object' || basicType === 'function') return { basicType, type: this.getClass(value) }
    return { basicType, type: basicType }
  }

  /**
   * Determines whether the passed value is a promise
   * @since 0.2.0
   * @param {*} value The value to be checked.
   * @returns {boolean}
   */
  static isThenable (value) {
    return value && typeof value.then === 'function'
  }

  /**
   * @typedef deepTypeOptions
   * @property {number} depth The depth limit
   * @property {number} wait How long to await promises (0 for no awaiting)
   * @property {Promise} [surrogatePromise] The promise to await, if different from `value`;
   *  this allows, e.g., a promise from `this.timeoutPromise` to be awaited instead of `value`
   */

  /**
   * @typedef deepType
   * @property {"none"|"values"|"keys&values"|"arity"|"emptiness"|"unknown-depths"|"unknown-value"} has
   * @property {string} [type] Not present if depth limit reached in previous recursion (`has` is "unknown-depths")
   *  or if empty (`has` is "emptiness")
   * @property {deepType} [keys] If present and `keys.has` is "unknown-depths", depth limit reached in current recursion
   * @property {deepType} [values] If present and `values.has` is "unknown-depths", depth limit reached in current recursion
   * @property {?number} [arity] If present and `arity` is null, depth limit reached in current recursion
   */

  /**
   * Returns the deep type of `value`, as a JSDoc-like string
   * @since 0.2.0
   * @param {*} value The value to get the deep type of
   * @param {deepTypeOptions} options Options
   * @returns {Promise<string>}
   */
  static async getJSDocString (value, options) {
    const return_ = SelfbotUtil.deepTypeToJSDoc(await SelfbotUtil.getDeepType(value, options))
    assert(typeof return_ === 'string')
    return return_
  }

  /**
   * Takes a deep type object and returns a JSDoc-like string representation of it
   * @since 0.2.0
   * @private
   * @param {deepType} deepType The deep type to parse
   * @returns {string}
   */
  static deepTypeToJSDoc (deepType) {
    return {
      none: () => deepType.type,
      values: () => {
        if (deepType.values.has === 'emptiness') return `${deepType.type}<>`
        if (deepType.values.has === 'unknown-depths') return deepType.type
        if (deepType.values.has === 'unknown-value') return `${deepType.type}<?>`
        return `${deepType.type}<${SelfbotUtil.deepTypeToJSDoc(deepType.values)}>`
      },
      'keys&values': () => {
        if (deepType.values.has === 'emptiness') {
          assert(deepType.keys.has === 'emptiness')
          return `${deepType.type}<>`
        }
        if (deepType.values.has === 'unknown-depths') {
          assert(deepType.keys.has === 'unknown-depths')
          return deepType.type
        }
        if (deepType.values.has === 'unknown-value') {
          console.error(`I didn't think this could happen.${deepType.keys.has === 'unknown-value' ? ' deepType.keys.has is also "unknown-value".' : ''}`)
          return `${deepType.type}<?, ?>`
        }
        return `${deepType.type}<${SelfbotUtil.deepTypeToJSDoc(deepType.keys)}, ${SelfbotUtil.deepTypeToJSDoc(deepType.values)}>`
      },
      arity: () => {
        if (deepType.arity === null) return deepType.type
        assert(typeof deepType.arity === 'number')
        assert(Number.isSafeInteger(deepType.arity))
        assert(deepType.arity >= 0)
        return deepType.arity > 0
          ? `${deepType.type}(${deepType.arity})`
          : `${deepType.type}()`
      },
    }[deepType.has]()
  }

  /**
   * @param {deepType} deepType The deepType to test
   * @returns {void}
   */
  static assertDeepType (deepType) {
    assert(!__dirname.includes('node_modules'), 'Hutch forgot to remove this function, somehow')
    const possibleHasValues = ['none', 'values', 'keys&values', 'arity', 'emptiness', 'unknown-depths', 'unknown-value']

    assert(typeof deepType === 'object')
    assert(typeof deepType.has === 'string' && deepType.has.length > 0)
    assert(possibleHasValues.includes(deepType.has))

    /* eslint-disable valid-jsdoc */ // Because they don't have a return tag
    const hasAssertions = {
      /** @param {deepType} dt deepType */
      none: dt => {
        assert(dt.keys === undefined)
        assert(dt.values === undefined)
        assert(dt.arity === undefined)
      },
      /** @param {deepType} dt deepType */
      values: dt => {
        assert(dt.keys === undefined)
        SelfbotUtil.assertDeepType(dt.values)
        assert(dt.arity === undefined)
      },
      /** @param {deepType} dt deepType */
      'keys&values': dt => {
        SelfbotUtil.assertDeepType(dt.keys)
        SelfbotUtil.assertDeepType(dt.values)
        assert(dt.arity === undefined)
      },
      /** @param {deepType} dt deepType */
      arity: dt => {
        assert(dt.keys === undefined)
        assert(dt.values === undefined)
        assert(dt.arity === null || (Number.isSafeInteger(dt.arity) && dt.arity >= 0))
      },
      /** @param {deepType} dt deepType */
      emptiness: dt => {
        assert(dt.type === undefined)
        assert(dt.keys === undefined)
        assert(dt.values === undefined)
        assert(dt.arity === undefined)
      },
      /** @param {deepType} dt deepType */
      'unknown-depths': dt => {
        assert(dt.type === undefined)
        assert(dt.keys === undefined)
        assert(dt.values === undefined)
        assert(dt.arity === undefined)
      },
      /** @param {deepType} dt deepType */
      'unknown-value': dt => {
        assert(dt.type === undefined)
        assert(dt.keys === undefined)
        assert(dt.values === undefined)
        assert(dt.arity === undefined)
      },
    }
    /* eslint-enable */

    assert(Object.keys(hasAssertions).length === possibleHasValues.length)
    assert(Object.keys(hasAssertions).every(v => possibleHasValues.includes(v)))
    assert(possibleHasValues.every(v => hasAssertions[v]))

    hasAssertions[deepType.has](deepType)
  }

  /**
   * Returns the deep type of `value`, as nested objects
   * @since 0.2.0
   * @param {*} value The value to get the deep type of
   * @param {deepTypeOptions} options Options
   * @returns {Promise<deepType>}
   */
  static async getDeepType (value, options) {
    if (!options) throw new TypeError('`options` is a required argument')
    if (typeof options.depth !== 'number') throw new TypeError('`options.depth` is a required argument')
    if (typeof options.wait !== 'number') throw new TypeError('`options.wait` is a required argument')
    assert(options.depth >= 0)

    const valuelessObjects = [Error, Date]
    const newOptions = Object.assign({}, options, { depth: options.depth - 1 })
    assert(newOptions.depth === options.depth - 1)
    const recur = val => SelfbotUtil.getDeepType(val, newOptions)

    const { type, basicType } = SelfbotUtil.getComplexType(value)
    // I'm not sure if syntax exists to name a function/class like this, but might as well do a sanity check
    if (type === '*' || type[0] === '?') throw new TypeError('ffs, why would you name a class or function that?!')
    // Deep types of timeout errors are converted to `{ has: 'unknown-value' }` below, so this assertion
    // should never be false unless the user passed a TimeoutError object directly into getDeepType
    assert(type !== SelfbotUtil.TimeoutError.name)

    const deepType = { has: 'none', type }

    if (basicType === 'object' && !valuelessObjects.some(klass => value instanceof klass)) {
      if (SelfbotUtil.isThenable(value) || Array.isArray(value) || value instanceof Set) {
        // Objects whose values should be displayed

        deepType.has = 'values'

        if (options.depth < 1) {
          deepType.values = { has: 'unknown-depths' }
        } else if (SelfbotUtil.isThenable(value)) {
          const awaitedValue = await (options.surrogatePromise || SelfbotUtil.timeoutPromise(value, options.wait))
          deepType.values = awaitedValue instanceof SelfbotUtil.TimeoutError
            ? { has: 'unknown-value' }
            : await recur(awaitedValue)
        } else if (Array.isArray(value)) {
          deepType.values = value.length === 0
            ? { has: 'emptiness' }
            : SelfbotUtil.mergeDeepTypeArray(await Promise.all(value.map(recur)))
        } else if (value instanceof Set) {
          deepType.values = value.size === 0
            ? { has: 'emptiness' }
            : SelfbotUtil.mergeDeepTypeArray(await Promise.all(Array.from(value.values()).map(recur)))
        }
      } else {
        // Objects whose keys and values should be displayed

        deepType.has = 'keys&values'

        if (options.depth < 1) {
          deepType.keys = { has: 'unknown-depths' }
          deepType.values = { has: 'unknown-depths' }
        } else if (value instanceof Map) {
          if (value.size === 0) {
            deepType.keys = { has: 'emptiness' }
            deepType.values = { has: 'emptiness' }
          } else {
            deepType.keys = SelfbotUtil.mergeDeepTypeArray(await Promise.all(Array.from(value.keys()).map(recur)))
            deepType.values = SelfbotUtil.mergeDeepTypeArray(await Promise.all(Array.from(value.values()).map(recur)))
          }
        // Plain objects and others
        } else if (Object.keys(value).length === 0) {
          deepType.keys = { has: 'emptiness' }
          deepType.values = { has: 'emptiness' }
        } else {
          deepType.keys = SelfbotUtil.mergeDeepTypeArray(await Promise.all(Object.keys(value).map(recur)))
          deepType.values = SelfbotUtil.mergeDeepTypeArray(await Promise.all(Object.values(value).map(recur)))
        }
      }
    } else if (basicType === 'function') {
      // Callable objects will just have their arity displayed
      deepType.has = 'arity'
      if (options.depth < 1) deepType.arity = null
      else deepType.arity = value.length
    }

    SelfbotUtil.assertDeepType(deepType)

    return deepType
  }

  /**
   * Reduce an array of deepType objects into a simgle one
   * @since 0.2.0
   * @private
   * @param {Array<deepType>} deepTypes Array of the deep types of value's contents
   * @returns {deepType} The merged deep type of value's contents
   */
  static mergeDeepTypeArray (deepTypes) {
    assert(typeof deepTypes === 'object' && Array.isArray(deepTypes))
    if (deepTypes.length === 0) throw new TypeError('`deepTypes` cannot be empty')

    /**
     * @type {deepType}
     * `mergedDeepType._nullType` should be "", "null", "undefined", or "null|undefined" if it exists at all
     */
    const mergedDeepType = deepTypes.reduce(SelfbotUtil.mergeTwoDeepTypes)

    if (typeof mergedDeepType._nullType === 'string') assert(['', 'null', 'undefined', 'null|undefined'].includes(mergedDeepType._nullType))

    assert(typeof mergedDeepType.type === 'string')

    if (mergedDeepType._nullType) mergedDeepType.type = `?${mergedDeepType.type}`
    delete mergedDeepType._nullType

    return mergedDeepType
  }

  /**
   * Merges `b` into `a`, intelligently comparing their types
   *
   * Not guaranteed to modify `a` in-place. Use the return value.
   * @since 0.2.0
   * @private
   * @param {deepType} a The first deep type (the target)
   * @param {deepType} b The second deep type (the source)
   * @returns {deepType}
   */
  static mergeTwoDeepTypes (a, b) {
    assert(typeof a === 'object')
    assert(typeof a.has === 'string' && a.has.length > 0)
    assert(typeof b === 'object')
    assert(typeof b.has === 'string' && b.has.length > 0)

    if (['emptiness', 'unknown-depths', 'unknown-value'].indexOf(a.has) !== -1 || a.type === '*') {
      if (a.type === '*') assert(a.has === 'none')
      assert(a.keys === undefined)
      assert(a.values === undefined)
      assert(a.arity === undefined)
      return a
    }

    if (SelfbotUtil.nullOrUndefinedRE.test(b.type)) {
      if (!a._nullType) a._nullType = b.type
      else if (a._nullType !== b.type) {
        assert(
          (a._nullType === 'null' && b.type === 'undefined') ||
          (a._nullType === 'undefined' && b.type === 'null')
        )
        a._nullType = 'null|undefined'
      }
    } else if (!a.type) {
      // Deep clone the object
      return JSON.parse(JSON.stringify(b))
    } else if (a.has === b.has && a.type === b.type) {
      ({
        none: () => undefined,
        values: () => {
          a.values = SelfbotUtil.mergeTwoDeepTypes(a.values, b.values)
        },
        'keys&values': () => {
          a.keys = SelfbotUtil.mergeTwoDeepTypes(a.keys, b.keys)
          a.values = SelfbotUtil.mergeTwoDeepTypes(a.values, b.values)
        },
        arity: () => {
          if (a.arity !== b.arity) a.arity = null
        },
      }[a.has])()
    } else {
      return { has: 'none', type: '*' }
    }

    if (!a.type) a.type = a._nullType
    assert(typeof a.type === 'string')

    return a
  }

  /**
   * Wrap a promise in a promise that will timeout in a certain amount of time.
   *
   * Whichever promise (the inputted one or the timeout one) resolves first will have its value be
   * the resolved value of the returned promise.
   * @since 0.2.0
   * @param {Promise} promise The promise to wrap.
   * @param {number} timeout How long the new promise should wait before timing out.
   * @returns {Promise}
   */
  static timeoutPromise (promise, timeout) {
    return Promise.race([promise, sleep(timeout, new this.TimeoutError('Promise timed out'))])
  }

  /**
   * Compose (combine) the given functions
   *
   * Functions are called from last to first.
   * @since 0.1.0
   * @param {Array<Function>} fns The functions to compose
   * @returns {Function} The function composition
   */
  static compose (...fns) {
    /**
     * @param {*} arg The value passed to the functions
     * @returns {*}
     */
    return function (arg) {
      fns.reduceRight(composeReduce.bind(this), arg)
    }.bind(this)
  }

  /**
   * Call (combine) the given functions in sequence
   *
   * Functions are called from first to last.
   * @since 0.1.0
   * @param {Array<Function>} fns The functions to compose in sequence
   * @returns {Function} The sequential function composition
   */
  static sequence (...fns) {
    /**
     * @param {*} arg The value passed to the functions
     * @returns {*}
     */
    return function (arg) {
      fns.reduce(composeReduce.bind(this), arg)
    }.bind(this)
  }

  /**
   * Call a method with special chars
   * @since 0.1.0
   * @param {string} method The method to call
   * @param {...*} args The args to pass
   * @throws {TypeError} If the method doesn't exist
   * @throws {*} Whatever the method throws
   * @returns {*} Whatever the method returns
   */
  static ツ (method, ...args) {
    if (SelfbotUtil.ツMethods[method]) return SelfbotUtil.ツMethods[method].call(this, ...args)
    throw new TypeError(`this.${method} is not a function`)
  }

  /**
   * Threads the expr through the forms
   *
   * Passes x as the second item in the first form. If there are more forms, passes the first form
   * as the second item in second form, etc.
   * @since 0.1.0
   * @param {*} x The value to thread
   * @param {Array<Function|Array>} forms Functions and/or arrays containing a function and args
   *  to pass to it after x
   * @returns {*} x, after it has been passed thru the forms
   */
  static threadFirst (x, ...forms) {
    return thread(true, x, ...forms)
  }

  /**
   * Threads the expr through the forms
   *
   * Passes x as the last item in the first form. If there are more forms, passes the first form
   * as the last item in second form, etc.
   * @since 0.1.0
   * @param {*} x The value to thread
   * @param {Array<Function|Array>} forms Functions and/or arrays containing a function and args
   *  to pass to it before x
   * @returns {*} x, after it has been passed thru the forms
   */
  static threadLast (x, ...forms) {
    return thread(false, x, ...forms)
  }
}

SelfbotUtil.ツMethods = {
  '->': SelfbotUtil.threadFirst,
  '->>': SelfbotUtil.threadLast,
}

/**
 * Used to mark when a promise has timed out
 * @since 0.2.0
 */
SelfbotUtil.TimeoutError = class TimeoutError extends Error {}

/**
 * Test if string is exactly "null" or "undefined"
 * @since 0.2.0
 */
SelfbotUtil.nullOrUndefinedRE = /^null$|^undefined$/

module.exports = SelfbotUtil
