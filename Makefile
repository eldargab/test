APP = $(shell echo $$PWD/bin/app)
RATE ?= 5
DELAY ?= 500

run: redis
	@(iojs $(APP) -r $(RATE) -d $(DELAY) > app.log 2>&1 &)

redis:
	@(redis-server --port 6379 --save "" > /dev/null &)

kill:
	@ps -A | grep $(APP) | grep -v grep | while read pid rest; \
	do \
		kill $$pid ; \
	done

errors:
	@iojs $(APP) --getErrors

worker: redis
	@(iojs $(APP) -w -d 0 > app.log 2>&1 &)

performance:
	@iojs ./bin/app --performance

crush:
	@make DELAY=0 RATE=20000 run

.PHONY: run redis kill errors worker performance crush
