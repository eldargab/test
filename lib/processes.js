'use strict'

const go = require('go-async')
const Client = require('./redis/client')
const read = require('fs').readFileSync
const push_lua = read(require.resolve('./push.lua'), 'utf8')
const spawn = require('child_process').spawn

exports.application = function*() {
  yield generator()
  yield worker()
}

exports.worker = worker

function* worker() {
  let redis = require('redis').createClient()
  let delay = option('delay', 500)
  try {
    while(true) {
      let msg = yield go.thunk(function(cb) {
        redis.blpop('messages', 1, cb)
      })
      if (!msg) {
        // either generator is down or there are to many workers
        // so try to become a generator, otherwise terminate
        return generator()
      }
      yield wait(Math.round(Math.random() * 2 * delay))
      let error = Math.random() > 0.85
      if (error) yield go.thunk(function(cb) {
        redis.rpush('errors', msg[1], cb)
      })
    }
  } finally {
    redis.end()
  }
}

function* generator() {
  let redis = new Client
  let msgs = messages()

  let rate = option('rate', 10)
  let timeout = Math.round(1000 / rate) // ms
  if (timeout < 5) timeout = 0
  let msgsPerCmd = timeout > 0 ? 1 : Math.round(rate / 5000) || 1

  let sp

  try {
    while(true) {
      let payload = take(msgsPerCmd, msgs)
      let cmd = ['EVAL', push_lua, 2, 'generator', 'messages', process.pid].concat(payload)
      let ok = yield redis.command(cmd)
      if (!ok) return
      sp = sp || run(spawner)
      assertRunning(sp)
      yield wait(timeout)
    }
  } finally {
    redis.close()
    sp && sp.abort()
  }
}

function* messages() {
  let i = 0
  while(true) {
    yield i++
  }
}

function take(len, seq) {
  let arr = []
  for(let x of seq) {
    if (len == 0) return arr
    arr.push(x)
    len--
  }
  return arr
}

function* spawner() {
  let redis = new Client
  let grow = 0
  let lastSpawned = 0
  try {
    while(true) {
      let prevGrow = grow
      let before = yield redis.llen('messages')
      yield wait(5000)
      let after = yield redis.llen('messages')
      grow = after - before

      if (grow <= 0) continue

      let workersToSpawn = prevGrow > 0
        ? Math.ceil(lastSpawned * grow / (prevGrow - grow))
        : 5

      if (workersToSpawn < 0) workersToSpawn = 5

      lastSpawned = workersToSpawn

      while(workersToSpawn--) {
        let child = spawn(process.argv[0], process.argv.slice(1).concat(['--worker']), {
          detached: true,
          stdio: 'inherit'
        })
        child.unref()
      }
    }
  } finally {
    redis.close()
  }
}

function wait(ms) {
  if (ms == 0) return
  return go.thunk(function(cb) {
    setTimeout(cb, ms)
  })
}

function run(proc) {
  let f = go.apply(null, arguments)
  f.name = proc.name
  return f
}

function assertRunning(proc) {
  if (proc.aborted) throw new Error(proc.name + ' aborted')
  if (proc.error) throw proc.error
  if (proc.ready) throw new Error(proc.name + ' terminated')
  return true
}

function option(name, def) {
  let val = process.options && process.options[name]
  if (val == null) return def
  return val
}

exports.errorsDumper = function*() {
  let redis = new Client
  let msg
  try {
    while(msg = yield redis.lpop('errors')) {
      console.log(msg)
    }
  } finally {
    redis.close()
  }
}

exports.performance = function*() {
  let redis = new Client
  try {
    while(true) {
      let before = yield redis.llen('errors')
      yield wait(3000)
      let after = yield redis.llen('errors')
      let messagesPerSecond = (after - before)/ (3 * 0.15)
      console.log(Math.round(messagesPerSecond))
    }
  } finally {
    redis.close()
  }
}
