'use strict'

const go = require('go-async')

module.exports = parse

function parse(s) {
  return go(function*() {
    switch(yield s.read(1)) {
      case '+':
        return pSimpleString(s)
      case '-':
        return pException(s)
      case ':': // :
        return pInt(s)
      case '$':
        return pBulkString(s)
      case '*':
        return pArray(s)
      default:
        throw new Error('Unknown redis type')
    }
  })
}

function pSimpleString(s) {
  return go(function*() {
    let ret = ''
    while(true) {
      let char = yield s.read(1)
      if (char == '\r') {
        yield s.expect('\n')
        return ret
      }
      ret += char
    }
  })
}

function pException(s) {
  return go(function*() {
    let msg = yield pSimpleString(s)
    return new Error(msg)
  })
}

function pInt(s) {
  return go(function*() {
    let msg = yield pSimpleString(s)
    return parseInt(msg, 10)
  })
}

function pBulkString(s) {
  return go(function*() {
    let len = yield pInt(s)
    if (len < 0) return null
    let ret = yield s.read(len)
    yield s.expect('\r\n')
    return ret
  })
}

function pArray(s) {
  return go(function*() {
    let len = yield pInt(s)
    if (len < 0) return null
    let ret = new Array(len)
    for(let i = 0; i < len; i++) {
      ret[i] = yield parse(s)
    }
    yield s.expect('\r\n')
    return ret
  })
}
