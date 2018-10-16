class Shard {
  constructor (wm) {
    this.wm = wm
  }
  sendWS (gateway, op, packet) {
    this.wm.connector.sendToGateway(gateway, {
      t: op,
      d: packet
    })
  }
}
module.exports = Shard
