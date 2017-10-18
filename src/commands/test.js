const { Command } = require('klasa')

module.exports = class extends Command {
  constructor (...args) {
    super(...args, { usage: '<test:str> [...]', usageDelim: ' ' })
  }

  async run (msg, [...args]) {
    msg.send(args.join(', '))
  }
}
