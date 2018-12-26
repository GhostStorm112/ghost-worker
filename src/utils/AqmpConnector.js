const EventEmitter = require('eventemitter3')
const amqp = require('amqp-connection-manager')
class AmqpConnector extends EventEmitter {
  constructor (client) {
    super()

    this.client = client
    this.connection = null
    this.channel = null
  }

  async initialize () {
    this.connection = amqp.connect([this.client.options.amqpUrl || 'amqp://localhost'], {json: true})
    this.channel = this.connection.createChannel({
      setup: function(channel) {
        return Promise.all([
          channel.assertQueue('weather-events', { durable: false, messageTtl: 60e3 }),
          channel.prefetch(1),
          channel.consume('weather-events', async event => {
            this.emit('event', JSON.parse(event.content.toString()))
            channel.ack(event)
          })
        ])
      }.bind(this)
    })
    this.connection.on('disconnect', function(params) {
      this.client.log.info('AMQP', 'Disconnected!')
      this.client.log.error('AMQP', 'Disconnected ' + params.err.stack)

    }.bind(this))
    this.connection.on('connect', function(params) {
      this.client.log.info('AMQP', 'Connected!')

    }.bind(this))
  }

  async sendToGateway (gateway, event) {
    return this.channel.sendToQueue(gateway, Buffer.from(JSON.stringify(event)))
  }
}

module.exports = AmqpConnector
