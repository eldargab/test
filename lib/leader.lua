local pid = ARGV[1]
local ttl = ARGV[2]
local leaderKey = KEYS[1]
local leader = redis.call('GET', leaderKey)

if leader == pid or not leader then
  redis.call('PSETEX', leaderKey, ttl, pid)
  return pid
end
