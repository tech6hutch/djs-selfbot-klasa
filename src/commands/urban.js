const { Command } = require('klasa')
const snek = require('snekfetch')

module.exports = class extends Command {
  constructor (...args) {
    super(...args, {
      cooldown: 5,
      description: 'Searches urban dictionary',
    })
  }

  async run (msg) {
    const search = msg.content.split(' ').slice(1)
    try {
      const {body} = await snek.get('http://api.urbandictionary.com/v0/define?term=' + encodeURIComponent(search.join(' ')))

      if (body.result_type === 'no_results') {
        await msg.channel.send('No results found')
      } else {
        var wordObject = body.list[0]
        await msg.channel.send({
          embed: {
            title: 'Urban Dictionary',
            description: wordObject.word,
            color: 0x372842,
            fields: [
              {
                name: 'Definition',
                value: wordObject.definition,
              },
              {
                name: 'Example',
                value: wordObject.example,
              },
              {
                name: 'Thumbs Up',
                value: wordObject.thumbs_up,
                inline: true,
              },
              {
                name: 'Thumbs Down',
                value: wordObject.thumbs_down,
                inline: true,
              },
            ],
          },
        })
      }
    } catch (e) {
      console.log(e)
    }
  }
}
