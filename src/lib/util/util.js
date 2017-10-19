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

class SelfbotUtil {
  constructor () {
    throw new Error('This class may not be initiated with new')
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

module.exports = SelfbotUtil
