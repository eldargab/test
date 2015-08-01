'use strict'

const go = require('go-async')
const Connection = require('./connection')

module.exports = Client

function Client() {
  this.connection = new Connection
  this.pending = false
}

Client.prototype.command = function*(cmd) {
  if (this.pending) throw new Error('Only one pending request is allowed')
  this.pending = true
  try {
    yield this.connection.command(cmd)
    let res = yield this.connection.read()
    if (res instanceof Error) throw res
    return res
  } catch(e){
    this.close()
    throw e
  } finally {
    this.pending = false
  }
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
