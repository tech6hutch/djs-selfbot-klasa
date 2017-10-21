const { join } = require('path')
const config = require(join(process.cwd(), 'config.json'))
const klasa = require('klasa')

module.exports = {
  SelfbotCommand: require('./lib/SelfbotCommand'),
  util: require('./lib/util/util.js'),
  imgURL: 'https://cdn.glitch.com/c726970b-47a8-42de-977b-385c6266279a/',
}

class Selfbot extends klasa.Client {}

new Selfbot(Object.assign(config, {
  clientBaseDir: __dirname,
  cmdEditing: true,
  readyMessage: client => `${client.user.tag}, Ready to serve ${client.guilds.size} guilds and ${client.users.size} users`,
})).login(config.token)
