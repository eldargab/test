'use strict'

const net = require('net')
const Stream = require('easy-streaming')
const go = require('go-async')
const parse = require('./parser')

module.exports = Connection

function Connection() {
  this.closed = false
}

/**
 * Open TCP socket for redis
 *
 * @private
 */

Connection.prototype.connect = function() {
  if (this.closed) throw new Error('Connection closed')
  if (this.connection) return this.connection

  let self = this

  return this.connection = go.thunk(function(cb) {
    let socket = self.socket = net.connect({port: 6379})

    socket.setEncoding('ascii')
    socket.setDefaultEncoding('ascii')

    socket.on('connect', function() {
      self.connection = socket
      cb(null, socket)
    })

    socket.on('error', function(err) {
      self.closed = true
      cb(err)
    })

    socket.on('close', function() {
      self.closed = true
      cb(new Error('Connection closed'))
    })
  })
}

/**
 * Close underlying connection
 */

Connection.prototype.close = function() {
  this.closed = true
  if (this.socket) this.socket.destroy()
}

/**
 * Send command to redis
 */

Connection.prototype.command = function*(cmd) {
  let socket = yield this.connect()
  let msg = serialize(cmd)
  socket.write(msg)
}

function serialize(cmd) {
  let ret = '*' + cmd.length + '\r\n'
  cmd.forEach(function(s) {
    s = String(s)
    ret += '$' + s.length + '\r\n' + s + '\r\n'
  })
  return ret
}

/**
 * Read incoming message
 *
 * @return {Future}
 */

Connection.prototype.read = function() {
  this.stream = this.stream || new Stream(function*(write) {
    let socket = yield this.connect()
    let stream = Stream.sanitize(socket)
    let parser = new Parser(parse)
    try {
      while(true) {
        let chunk = yield stream.read()
        if (chunk == null) throw new Error('Unexpected end of incoming redis stream')
        parser.write(chunk)
        let msg
        while(undefined !== (msg = parser.read())) {
          yield write(msg)
        }
      }
    } finally {
      this.close()
    }
  }.bind(this))
  return this.stream.read()
}

function Parser(fn) {
  this.fn = fn
  this.req = 0
  this.buf = ''
  this.stack = [null, null, null, null]
  this.idx = 0
}

Parser.prototype.write = function(buf) {
  this.buf += buf
}

Parser.prototype.read = function() {
  if (!this.gen) {
    this.gen = this.fn()
    this.req = 0
  }

  let feed = this.take(this.req)
  if (feed == null) return

  while(true) {
    let itm = this.gen.next(feed)
    if (itm.done) this.pop()
    let x = itm.value
    if (isGenerator(x)) {
      this.push(x)
    } else {
      if (itm.done) {
        if (!this.gen) return x
        feed = x
      } else {
        feed = this.take(x)
        if (feed == null) return
      }
    }
  }
}

Parser.prototype.take = function(len) {
  if (len == 0) return ''
  if (len > this.buf.length) {
    this.req = len
    return
  }
  let ret = this.buf.slice(0, len)
  this.buf = this.buf.slice(len)
  return ret
}

Parser.prototype.push = function(gen) {
  this.stack[this.idx] = this.gen
  this.gen = gen
  this.idx++
}

Parser.prototype.pop = function() {
  if (this.idx == 0) return this.gen = null
  this.idx--
  this.gen = this.stack[this.idx]
  this.stack[this.idx] = null
}

function isGenerator(obj) {
  return obj && typeof obj.throw == 'function'
}
