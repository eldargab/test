APP = $(shell echo $$PWD/bin/app)
RATE ?= 5
DELAY ?= 500

run: redis
	@($(APP) -r $(RATE) -d $(DELAY) > app.log 2>&1 &)

errors:
	@$(APP) --getErrors

kill:
	@ps -A | grep $(APP) | grep -v grep | while read pid rest; \
	do \
		kill $$pid ; \
	done

redis:
	@(redis-server > /dev/null &)

.PHONY: run errors redis kill
