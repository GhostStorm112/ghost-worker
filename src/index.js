require('bluebird')
require('dotenv').config()

const { default: Cache } = require('@spectacles/cache')
const EventEmitter = require('eventemitter3')
const SnowTransfer = require('snowtransfer')
const GhostCore = require('ghost-core')
const SettingsManager = require('SettingsManager')
const Shard = require('./utils/shard')
const AmqpConnector = require('./utils/AqmpConnector')
const promisifyAll = require('tsubaki').promisifyAll
const fs = promisifyAll(require('fs'))
const path = require('path')
const info = require('../package.json')
const Handler = require('./CommandHandler/Handler')
class GhostWorker extends EventEmitter {
  constructor (options = { }) {
    super()

    this.options = Object.assign({
      disabledEvents: null,
      camelCaseEvents: false,
      eventPath: path.join(__dirname, './eventHandlers/')
    }, options)

    this.settings = new SettingsManager({
      dburl: options.mongoUrl
    })

    this.cache = new Cache({
      port: 6379,
      host: options.redisUrl,
      db: 0
    })

    this.lavalink = new GhostCore.LavalinkWorker({
      user: options.botId,
      password: options.lavalinkPassword,
      rest: options.lavalinkRest,
      ws: options.lavalinkWs,
      redis: this.cache,
      gateway: this.shard
    })
    
    this.info = info
    this.shard = new Shard(this)
    this.rest = new SnowTransfer(options.discordToken, {baseHost: options.restHost})
    this.connector = new AmqpConnector(this)
    this.commandHandler = new Handler(options.inhibitorPath, options.commandPath, this)
    this.eventHandlers = new Map()
    this.log = new GhostCore.Logger()
    
    this.isOwner = function isOwner (id) {
      if (id === options.ownerId) {
        return true
      } else {
        return false
      }
    }
  }

  async initialize () {
    this.log.info('Worker', 'Starting...')
    await this.connector.initialize()
    await this.settings.init()
    await this.commandHandler.initialize() 
    await this.loadEventHandlers()
    this.log.info('Worker', 'Started succesfully')
    this.lavalink.on('error', (d) => {
      this.log.error('Lavalink', d)
      this.log.info('Lavalink', 'Waiting for reconnect')
    })
    this.connector.on('event', event => {
      if (event.d) { event.d['shard_id'] = event.shard_id }
      if(event.t === 'MESSAGE_CREATE'){
        this.commandHandler.handle(event.d)
      } else {
        this.emit(event.t, event.d)

      }
    })
  }

  async loadEventHandlers () {
    const files = await fs.readdirAsync(this.options.eventPath)

    for (const file of files) {
      if (!file.endsWith('.js') || file.includes(' ')) { continue }

      const handler = new (require(this.options.eventPath + file))(this)
      this.eventHandlers.set(handler.name, handler)
      this.log.debug('Loader', `Handler ${handler.name} loaded`)

      if (typeof handler.init === 'function') { await handler.init() }

      for (const event of handler.canHandle) { this.on(event, handler.handle.bind(handler)) }
    }
  }
}

module.exports = GhostWorker
