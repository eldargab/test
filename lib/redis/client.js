'use strict'

const Connection = require('./connection')

module.exports = Client

function Client() {
  this.connection = new Connection
  this.pending = false
}

Client.prototype.exec = function*(block) {
  if (this.pending) throw new Error('Only one pending request is allowed')
  this.pending = true
  try {
    return (yield block.call(this))
  } catch(e){
    this.close()
    throw e
  } finally {
    this.pending = false
  }
}

Client.prototype.command = function*(cmd) {
  return this.exec(function*() {
    yield this.connection.command(cmd)
    let res = yield this.connection.read()
    if (res instanceof Error) throw res
    return res
  })
}

Client.prototype.close = function() {
  this.connection.close()
}

Client.prototype.lpop = function(key) {
  return this.command(['LPOP', key])
}

Client.prototype.rpush = function(key, val) {
  return this.command(['RPUSH', key, val])
}

Client.prototype.blpop = function*(key, secs) {
  return this.command(['BLPOP', key, secs || 0])
}

Client.prototype.llen = function*(key) {
  return this.command(['LLEN', key])
}
