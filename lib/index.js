const cacheManager = require('cache-manager')
const createWebhook = require('github-webhook-handler')

const createApp = require('./github-app')
const createRobot = require('./robot')
const createServer = require('./server')
const resolve = require('./resolver')
const logger = require('./logger')

const cache = cacheManager.caching({
  store: 'memory',
  ttl: 60 * 60 // 1 hour
})

const defaultApps = [
  require('./plugins/sentry'),
  require('./plugins/stats'),
  require('./plugins/default')
]

module.exports = (options = {}) => {
  const webhook = createWebhook({path: options.webhookPath || '/', secret: options.secret || 'development'})
  const app = createApp({
    id: options.id,
    cert: options.cert
  })
  const server = createServer({webhook, logger})

  // Log all received webhooks
  webhook.on('*', event => {
    logger.info({event}, 'Webhook received')
    receive(event)
  })

  // Log all webhook errors
  webhook.on('error', logger.error.bind(logger))

  const robots = []

  function receive (event) {
    return Promise.all(robots.map(robot => robot.receive(event)))
  }

  function load (plugin) {
    if (typeof plugin === 'string') {
      plugin = resolve(plugin)
    }

    const robot = createRobot({app, cache, logger, catchErrors: true})

    // Connect the router from the robot to the server
    server.use(robot.router)

    // Initialize the plugin
    plugin(robot)
    robots.push(robot)

    return robot
  }

  function setup (apps) {
    // Log all unhandled rejections
    process.on('unhandledRejection', logger.error.bind(logger))

    // Load the given apps along with the default apps
    apps.concat(defaultApps).forEach(app => load(app))
  }

  return {
    server,
    webhook,
    receive,
    logger,
    load,
    setup,

    start () {
      server.listen(options.port)
      logger.trace('Listening on http://localhost:' + options.port)
    }
  }
}

module.exports.createRobot = createRobot
