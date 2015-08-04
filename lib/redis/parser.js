'use strict'

module.exports = parse

function* parse() {
  switch(yield 1) {
    case '+':
      return pSimpleString()
    case '-':
      return pException()
    case ':':
      return pInt()
    case '$':
      return pBulkString()
    case '*':
      return pArray()
    default:
      throw new Error('Unknown redis type')
  }
}

function* pSimpleString() {
  let ret = ''
  while(true) {
    let char = yield 1
    if (char == '\r') {
      yield expect('\n')
      return ret
    }
    ret += char
  }
}

function* pException() {
  let msg = yield pSimpleString()
  return new Error(msg)
}

function* pInt() {
  let msg = yield pSimpleString()
  return parseInt(msg, 10)
}

function* pBulkString() {
  let len = yield pInt()
  if (len < 0) return null
  let ret = yield len
  yield expect('\r\n')
  return ret
}

function* pArray() {
  let len = yield pInt()
  if (len < 0) return null
  let ret = new Array(len)
  for(let i = 0; i < len; i++) {
    ret[i] = yield parse()
  }
  return ret
}

function* expect(expected) {
  let got = yield expected.length
  if (got == expected) return got
  throw new Error('Unexpected bytes in the wire')
}
