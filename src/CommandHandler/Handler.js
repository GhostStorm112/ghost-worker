const EventEmitter = require('eventemitter3')
const promisifyAll = require('tsubaki').promisifyAll
const {readdirSync, statSync} = promisifyAll(require('fs'))
const path = require('path')

class Handler extends EventEmitter {
  constructor (inhibitorPath,commandPath,client) {
    super()

    this.client = client

    this.prefix = process.env.PREFIX
    this.mentionRegex = new RegExp(`<@${process.env.BOT_ID}>`)

    this.commandPath = commandPath
    this.inhibitorPath = inhibitorPath

    this.commands = new Map()
    this.inhibitors = new Map()

  }

  async initialize () {
    await this.loadInhibitors()
    await this.loadCommands()
  }

  async reload () {
    this.commands = new Map()
    this.inhibitors = new Map()
    await this.loadInhibitors()
    await this.loadCommands()
  }


  async handle (event) {
    try {
      if (event.author.bot || event.author.id === process.env.BOT_ID) { return }
      let command
      
      if (this.mentionRegex.test(event.content)) { command = event.content.replace(/^[^ ]+ /, '').trim() } else if (event.content.startsWith(this.prefix)) { command = event.content.substring(this.prefix.length).trim() } else { return }
      
      const commandName = command.match(/^[^ ]+/)[0].toLowerCase()
      const matched = this.commands.get(commandName)
      // this.client.log.profile(`Command ${commandName}`)

      if (!command) { return }
      
      const reason = this.runInhibitors(event, commandName)
      if (await reason) {
        // this.client.log.profile(`Command ${commandName}`)
        return this.client.rest.channel.createMessage(event.channel_id, await reason)
      }

      if (matched) {
        if (commandName === 'help' && command.substring(commandName.length + 1)) {
          // this.client.log.profile(`Command ${commandName}`)
        /*   this.statsClient.increment('command', 1, 1, [`command:${commandName}`, `guild:${event.guild_id}`], (error) => {
            if (error) {
              this.client.log.error('CommandHandler', error.message)
            }
          }) */
          return await matched.run(event, command.substring(commandName.length + 1), this.commands)
        } else {
          // this.client.log.profile(`Command ${commandName}`)
          /*    this.statsClient.increment('command', 1, 1, [`command:${commandName}`, `guild:${event.guild_id}`], (error) => {
            if (error) {
              this.client.log.error('CommandHandler', error)
            }
          }) */
          if(matched.allowPM && !event.guild_id){
            return this.client.rest.channel.createMessage(event.channel_id, 'This command is not allowed in PM\'S!') 
          } else {
            return await matched.run(event, command.substring(commandName.length + 1))
          }
        }
      }
      for (const c of this.commands.values()) {
        if (c.aliases && c.aliases.includes(commandName)) {
          // this.client.log.profile(`Command ${commandName}`)
          if(c.allowPM && !event.guild_id){
            return this.client.rest.channel.createMessage(event.channel_id, 'This command is not allowed in PM\'S!') 
          } else {
            return await c.run(event, command.substring(commandName.length + 1))
          }
        }
      }
    } catch (error) {
      console.error(error)
      this.client.log.error('CommandHandler', error.message)
    }
  }

  async runInhibitors (event, commandName) {
    let reason
    this.inhibitors.forEach(inhibitor => {
      reason = inhibitor.run(event, commandName).then(_reason => {
        if (_reason !== undefined) {
          return _reason
        }
      })
    })
    return reason
  }

  async loadInhibitors () {
    const files = readdirSync(this.inhibitorPath)
    for (let file of files) {
      file = path.join(this.inhibitorPath, file)
      if (path.extname(file) === '.js') {
        const inhibitor = new (require(file))(this)
        this.inhibitors.set(inhibitor.name, inhibitor)
        this.client.log.debug('Loader', `Inhibitor ${inhibitor.name} loaded`)
      }
    }
  }

  async loadCommands () {
    const files = readdirSync(this.commandPath)
    for (let file of files) {
      file = path.join(this.commandPath, file)
      const stats = statSync(file)
      if (path.extname(file) === '.js' && !stats.isDirectory()) {
        const command = new (require(file))(this)
        this.commands.set(command.name, command)
        this.client.log.debug('Loader', `Command ${command.name} loaded`)
      } else if (stats.isDirectory()) {
        this.loadCommandsIn(file)
      }
    }
  }

  async loadCommandsIn (dir) {
    const files = readdirSync(dir)
    for (let file of files) {
      file = path.join(dir, file)
      const stats = statSync(file)
      if (path.extname(file) === '.js' && !stats.isDirectory()) {
        const command = new (require(file))(this)
        this.commands.set(command.name, command)
        this.client.log.debug('Loader', `Command ${command.name} loaded`)
      }
    }
  }

}

module.exports = Handler
