const { Collection } = require('discord.js')
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
 * @param {Array<Function|Array>} forms Functions and/or arrays containing a function and args
 *  to pass to it before/after x
 * @returns {*} x, after it has been passed thru the forms
 */
const thread = (first, x, ...forms) => {
  const form = forms.shift()
  if (form === undefined) return x
  if (Array.isArray(form)) {
    const f = form.shift()
    // Array#unshift/Array#push put x at the beginning/end of the array
    form[first ? 'unshift' : 'push'](x)
    return thread(first, f.apply(this, form), forms)
  }
  return form.call(this, x)
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
    const basicType = this.getType(value)
    if (basicType === 'object' || basicType === 'function') return { basicType, type: this.getClass(value) }
    return { basicType, type: basicType }
  }

  /**
   * Get the arity of fn
   * @param {Function} fn The function whose arity is to be returned
   * @returns {string}
   */
  static getFunctionType (fn) {
    return `(${fn.length}-arity)`
  }

  /**
   * Get the type of array's elements
   * @param {Array} array The array whose element type is to be returned
   * @param {number} depth The depth to get the type, recursively
   * @param {number} [i=0] Just an iteration count to prevent infinite loops
   * @returns {string}
   */
  static getArrayType (array, depth, i = 0) {
    if (typeof depth !== 'number') throw new TypeError('`depth` is missing, or not a number')
    return `<${this._getObjType(array, depth, i)}>`
  }

  /**
   * Get the type of obj's elements
   * @param {Object} obj The object whose element type is to be returned
   * @param {number} depth The depth to get the type, recursively
   * @param {number} [i=0] Just an iteration count to prevent infinite loops
   * @returns {string}
   */
  static getObjectType (obj, depth, i = 0) {
    if (typeof depth !== 'number') throw new TypeError('`depth` is missing, or not a number')
    const type = this._getObjType(Object.values(obj), depth, i)
    return type.length > 0 ? `<${this.getComplexType('').type}, ${type}>` : '<>'
  }

  /**
   * Get the type of map's values
   * @param {Map} map The map whose value type is to be returned
   * @param {number} depth The depth to get the type, recursively
   * @param {number} [i=0] Just an iteration count to prevent infinite loops
   * @returns {string}
   */
  static getMapType (map, depth, i = 0) {
    if (typeof depth !== 'number') throw new TypeError('`depth` is missing, or not a number')
    const keyType = this._getObjType(Array.from(map.keys()), depth, i)
    const valueType = this._getObjType(Array.from(map.values()), depth, i)
    return valueType.length > 0 ? `<${keyType}, ${valueType}>` : '<>'
  }

  /**
   * Get the type of set's values
   * @param {Set} set The set whose value type is to be returned
   * @param {number} depth The depth to get the type, recursively
   * @param {number} [i=0] Just an iteration count to prevent infinite loops
   * @returns {string}
   */
  static getSetType (set, depth, i = 0) {
    if (typeof depth !== 'number') throw new TypeError('`depth` is missing, or not a number')
    return `<${this._getObjType(Array.from(set.values()), depth, i)}>`
  }

  /**
   * Get the type of values's elements
   * @private
   * @param {Array} values The array whose element type is to be returned
   * @param {number} depth The depth to get the type, recursively
   * @param {number} i Just an iteration count to prevent infinite loops
   * @returns {string}
   */
  static _getObjType (values, depth, i) {
    if (!Array.isArray(values)) throw new TypeError("You're using this function wrong; `values` must be an array")
    if (typeof depth !== 'number') throw new TypeError('`depth` is missing, or not a number')
    if (typeof i !== 'number') throw new TypeError('`i` is missing, or not a number')
    // Collections have useful methods, which work on Sets.
    const Coll = Collection.prototype

    const objTypes = new Set(values.map(v => this.getComplexType(v).type))
    const nonNullTypes = new Set()
    const nullTypes = new Set()
    for (const type of objTypes.values()) {
      if (['null', 'undefined'].includes(type)) nullTypes.add(type)
      else nonNullTypes.add(type)
    }

    if (nonNullTypes.size > 1) return '*'
    if (nonNullTypes.size === 1) {
      const type = Coll.first.call(nonNullTypes)
      const value = values.find(v => v != null)
      const nestedType = this.getComplexType(value)
      let nestedTypeStr = ''
      if (i < depth) {
        if (nestedType.basicType === 'object') {
          if (Array.isArray(value)) nestedTypeStr = this.getArrayType(value, depth, i + 1)
          else if (value instanceof Map) nestedTypeStr = this.getMapType(value, depth, i + 1)
          else if (value instanceof Set) nestedTypeStr = this.getSetType(value, depth, i + 1)
          else nestedTypeStr = this.getObjectType(value, depth, i + 1)
        } else if (nestedType.basicType === 'function') nestedTypeStr = this.getFunctionType(value, depth, i + 1)
      }
      if (nullTypes.size > 0) return `?${type}${nestedTypeStr}`
      return `${type}${nestedTypeStr}`
    }

    // No types besides, possibly, "null" and "undefined"
    if (nullTypes.size > 1) return 'null|undefined'
    if (nullTypes.size === 1) return Coll.first.call(nullTypes)

    // No types at all, i.e. no elements at all
    return ''
  }

  /**
   * Determines whether the passed value is an Array.
   * @param {*} value The value to be checked.
   * @returns {boolean}
   */
  static isThenable (value) {
    return value && typeof value.then === 'function'
  }

  /**
   * Wrap a promise in a promise that will timeout in a certain amount of time.
   *
   * Whichever promise (the inputted one or the timeout one) resolves first will have its value be
   * the resolved value of the returned promise.
   * @param {Promise} promise The promise to wrap.
   * @param {number} timeout How long the new promise should wait before timing out.
   * @returns {Promise}
   */
  static timeoutPromise (promise, timeout) {
    return Promise.race([promise, sleep(timeout, new this.TimeoutError('Promise timed out'))])
  }

  /**
   * Present time duration in a nice way
   * @param {number} time A duration in milliseconds
   * @returns {string}
   */
  static getNiceDuration (time) {
    if (time >= 1000) return `${(time / 1000).toFixed(2)}s`
    if (time >= 1) return `${time.toFixed(2)}ms`
    return `${(time * 1000).toFixed(2)}μs`
  }

  /**
   * Compose (combine) the given functions
   *
   * Functions are called from last to first.
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

  static ツ (method, ...args) {
    SelfbotUtil.ツMethods[method].call(this, ...args)
  }

  /**
   * Threads the expr through the forms
   *
   * Passes x as the second item in the first form. If there are more forms, passes the first form
   * as the second item in second form, etc.
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

SelfbotUtil.TimeoutError = class TimeoutError extends Error {}

module.exports = SelfbotUtil
