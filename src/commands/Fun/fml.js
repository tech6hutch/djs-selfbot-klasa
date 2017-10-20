const { Command } = require('klasa')

const HTMLParser = require('fast-html-parser')
const snekfetch = require('snekfetch')

module.exports = class extends Command {
  constructor (...args) {
    super(...args, {
      cooldown: 5,
      description: 'Grabs random \'Fuck My Life\' quote from the web.',
    })
  }

  async run (msg) {
    const { text: html } = await snekfetch.get('http://www.fmylife.com/random')
    const root = HTMLParser.parse(html)
    const article = root.querySelector('.block a')
    return msg.send(article.text)
  }
}
