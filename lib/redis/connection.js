'use strict'

const net = require('net')
const go = require('go-async')
const Stream = require('easy-streaming')
const parse = require('./parser')

module.exports = Connection

function Connection() {
  this.closed = false
}

Connection.prototype.connect = function() {
  if (this.closed) throw new Error('Connection closed')
  if (this.connection) return this.connection

  let self = this

  return this.connection = new Promise(function(resolve, reject) {
    let socket = self.socket = net.connect({port: 6379})

    socket.setEncoding('ascii')
    socket.setDefaultEncoding('ascii')

    socket.on('connect', function() {
      self.connection = socket
      resolve(socket)
    })

    socket.on('error', function(err) {
      self.closed = true
      reject(err)
    })

    socket.on('close', function() {
      self.closed = true
      reject(new Error('Connection closed'))
    })
  })
}

Connection.prototype.close = function() {
  this.closed = true
  if (this.socket) this.socket.destroy()
}

Connection.prototype.command = function(cmd) {
  return go(function*() {
    let socket = yield this.connect()
    let msg = serialize(cmd)
    socket.write(msg)
  }.bind(this))
}

function serialize(cmd) {
  let ret = '*' + cmd.length + '\r\n'
  cmd.forEach(function(s) {
    ret += '$' + s.length + '\r\n' + s + '\r\n'
  })
  return ret
}

Connection.prototype.read = function() {
  this.stream = this.stream || new Stream(function*(write) {
    let socket = yield this.connect()
    let raw = Stream.sanitize(socket)
    let bytes = new Bytes(raw)
    try {
      while(true) {
        yield write(yield parse(bytes))
      }
    } finally {
      this.close()
    }
  }.bind(this))
  return this.stream.read()
}

function Bytes(stream) {
  this.stream = stream
  this.buf = ''
}

Bytes.prototype.read = function(len) {
  if (this.buf.length >= len) {
    let ret = this.buf.slice(0, len)
    this.buf = this.buf.slice(len)
    return ret
  }
  return go(function*() {
    let chunk = yield this.stream.read()
    if (!chunk) throw new Error('Unexpected end of stream')
    this.buf += chunk
    return this.read(len)
  }.bind(this))
}

Bytes.prototype.expect = function(expected) {
  return go(function*() {
    let got = yield this.read(expected.length)
    if (got == expected) return got
    throw new Error('Unexpected bytes in the wire')
  }.bind(this))
}
