const EventEmitter = require('eventemitter3')
const amqp = require('amqplib')
class AmqpConnector extends EventEmitter {
  constructor (client) {
    super()

    this.client = client
    this.connection = null
    this.channel = null
  }

  async initialize () {
    this.connection = await amqp.connect(this.client.options.amqpUrl || 'amqp://localhost')
    this.channel = await this.connection.createChannel()

    this.emit('ready')

    this.channel.assertQueue('weather-events', { durable: false, messageTtl: 60e3 })
    this.channel.consume('weather-events', async event => {
      await this.channel.ack(event)
      this.emit('event', JSON.parse(event.content.toString()))
    })
  }

  async sendToGateway (shardId, event) {
    if (shardId >= 0) {
      console.log(`shard-${shardId}`)
      console.log(event.t)
      return this.channel.sendToQueue(`shard-${shardId}`, Buffer.from(JSON.stringify(event)))
    }
  }
}

module.exports = AmqpConnector
