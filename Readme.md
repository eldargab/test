##Ключевые файлы

  * [lib/processes.js](blob/master/lib/processes.js) - собственно, приложение
  * [lib/redis/connection.js](blob/master/lib/redis/connection.js) - сокет-подобная абстракция поверх TCP
  для обмена сообщениями с redis
  * [lib/redis/client.js](blob/master/lib/redis/client.js) - redis клиент
  * [lib/redis/parser.js](blob/master/lib/redis/parser.js) - парсер для протокола redis

##Структура

Логически, приложение разбито на три процесса - [generator](blob/master/lib/processes.js#L37),
[spawner](blob/master/lib/processes.js#L76), [worker](blob/master/lib/processes.js#L11).

###generator

Генерирует сообщения для обработки помещая их в лист `messages` (`RPUSH messages msg`).
Отправка сообщений осуществляется командой `EVAL`, которая запускает серверный скрипт
[push.lua](blob/master/lib/push.lua). Использование скрипта позволяет обеспечить
строгую атомарность (требование не более одного генератора в приложении).

###spawner

Следит за скоростью обработки сообщений и, в случаи необходимости, запускает
дополнительные worker процессы. spawner всегда работает совместно с генератором
в рамках одной node инстанции.

###worker

Забирает сообщения из redis (`BLPOP messages 1`) и обрабатывет их. В случаи таймаута
пробует стать генератором, иначе завершается.

##Замечания по реализации

Данное приложение послужило тестом для нескольких идей
связанных с применением ES6 генераторов.

###[go-async](https://github.com/eldargab/go-async)

Реализация `async/await`, которая в отличии от [co](https://github.com/tj/co)
поддерживает

1) Прерывание и преждевременный выход

```javascript
let future = go(function* generator() {
  let redis = new Client
  let i = 0
  try {
    while(true) {
      yield redis.rpush('messages', i++)
    }
  } finally {
    redis.close()
  }
})

// В любой момент мы можем завершить асинхронное вычисление
// освободив все ресурсы.
future.abort()
```

2) Хвостовой рекурсивный вызов

```javascript
// co заставляет делать следующее
function* async() {
  let x = yield a()
  let y = yield b(x)
  return y
}

// мы в полне можем и так
function* async() {
  let x = yield a()
  return b(x)
}

// что это даёт?
function* worker() {
  let redis = new Client
    , msg
  try {
    while(msg = yield redis.blpop('messages', 1)) {
      yield process(msg)
    }
    // нехватает сообщений для обработки,
    // превращаемся в генератор
    return generator()
    // перед тем как генератор запустится
    // finally блок будет выполнен
    // всё состояние связанное с worker гарантированно превратится в мусор
  } finally {
    redis.close()
  }
}
```

3) "Ожидание" обычных значений

```javascript
function* sync() {
  let one = yield 1 // это не будет пропихнуто через event loop
  let two = yield 2 // генератор продолжит работу немедленно
  return one + two
}
```

Очень часто мы пишем функции, для которых невозможно предсказать, когда будет готово
выходное значение. Например, функция, которая читает входящее сообщение от redis
будет иметь асинхронный API, однако, при чтении pipeline ответов в цикле огромное кол-во
ответов будет доступно немедленно. Пропускать всё это через event loop (4ms! для Promise)
неприемлемо. Помимо этого, отсутсвие явного разграничения между
синхронными и асинхронными функциями часто приводит к улучшению модульности.

###[easy-streaming](https://github.com/eldargab/easy-streaming)

Provides convenient way to define pull-based readable streams.

```javascript
let stream = new Stream(function*(write) {
  yield write(1)
  yield write(2)
  yield write(3)
})

go(function*() {
  console.log(yield stream.read()) // печатает 1
  console.log(yield stream.read()) // печатает 2
  console.log(yield stream.read()) // печатает 3
})
```

###Парсер

Изначально парсер для redis-клиента был реализован с помощью go-async.
К сожалению, асинхронная функция даже притом, что все
значения доступны сразу, всё равно работает значительно медленнее аналогичного синхронного кода.
Говоря конкретней, каждый `yield` стоит микросекунду и вряд ли можно что-то улучшить.
Для парсера такая производительность неприемлема. В тоже время принципиально
неприемлемым является усложнение кода приложения. В качестве решения можно попробовать упростить
функцию, которая выполняет генератор, и оптимизровать её именно для парсинга.
Что и было сделано [lib/redis/connection.js#L105](blob/master/lib/redis/connection.js#L105).
Производительность приложения в целом возрасла процентов на 15, однако, поскольку детальных
тестов пока нет, судить о настоящей производительности такого парсера пока нельзя.

##Запуск

```bash
make # Запустить приложение
make kill # Убить все процессы (завершить приложение)
make errors # Прочитать и удалить все сообщения из реестра ошибок
make performance # Оценить кол-во обрабатываемых сообщений в секунду (по скорости накопления ошибок)
```
