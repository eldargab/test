local pid = ARGV[1]
local ttl = ARGV[2]
local key = KEYS[1]
local owner = redis.call('GET', key)

if owner == pid or not owner then
  redis.call('PSETEX', key, ttl, pid)
  return pid
else
  return owner
end
