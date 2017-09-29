const config = require('./config.json')
const klasa = require('klasa')

class Selfbot extends klasa.Client {}

new Selfbot(Object.assign(config, {
  cmdEditing: true,
  readyMessage: client => `${client.user.tag}, Ready to serve ${client.guilds.size} guilds and ${client.users.size} users`,
})).login(config.token)
