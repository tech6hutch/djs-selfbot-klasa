const { SelfbotCommand, imgURL } = require.main.exports
const { URL } = require('url')
const { Canvas } = require('canvas-constructor')
const snek = require('snekfetch')

/**
 * Get the slap image
 * @param {string} slapper The slapper's avatar URL
 * @param {string} slapped The slapped's avatar URL
 * @returns {Promise<CanvasConstructor>}
 */
const getSlapped = async (slapper, slapped) => {
  const [
    { body: baseBuffer },
    { body: slapperAvatarBuffer },
    { body: slappedAvatarBuffer },
  ] = await Promise.all([
    snek.get(new URL('imageSlap.png', imgURL).toString()),
    snek.get(slapper),
    snek.get(slapped),
  ])
  return new Canvas(950, 475)
    .addImage(baseBuffer, 0, 0, 950, 475)
    .addImage(slapperAvatarBuffer, 410, 107, 131, 131, { type: 'round', radius: 66 })
    .restore()
    .addImage(slappedAvatarBuffer, 159, 180, 169, 169, { type: 'round', radius: 85 })
    .restore()
    .toBuffer()
}

class Slap extends SelfbotCommand {
  constructor (...args) {
    super(...args, {
      aliases: ['batman'],
      description: 'Slap another user as Batman.',
      usage: '<slappedMember:member>',
      extendedHelp: 'Mention another user to slap them. AND BE BATMAN.',
      botPerms: ['ATTACH_FILES'],
    })
  }

  /**
   * Run the slap command
   * @param {DiscordMessage} msg The command message
   * @param {Array<GuildMember>} args The args passed to the command
   * @returns {Promise<DiscordMessage>}
   */
  async run (msg, [slappedMember]) {
    try {
      const slapped = slappedMember.user
      const slapper = msg.author
      if (slapped.id === slapper.id) return msg.send('Stop hitting yourself, stop hitting yourself, stop hitting yourself...')
      const loadingMsg = await msg.send(`Finding ${slappedMember.displayName}...`)

      const result = await getSlapped(slapper.displayAvatarURL({ format: 'png' }), slapped.displayAvatarURL({ format: 'png' }))
      loadingMsg.delete()
      return msg.channel.send({ files: [{ attachment: result, name: 'slapped.png' }] })
    } catch (error) {
      console.log(error)
    }
    return msg.send('Something went wrong; check the console.')
  }
}

module.exports = Slap
