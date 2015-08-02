local pid = ARGV[1]
local lock = KEYS[1]
local key = KEYS[2]
local owner = redis.call('GET', lock)

if not owner then
  owner = pid
end

if owner ~= pid then
  return 0
end

redis.call('PSETEX', lock, 1000, pid)

for i = 2, #ARGV do
  redis.call('RPUSH', key, ARGV[i])
end

return 1
