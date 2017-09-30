const { Command } = require('klasa')

module.exports = class extends Command {
  constructor (...args) {
    super(...args, {
      aliases: ['commands'],
      description: 'Display help for a command.',
      usage: '[Command:cmd] [Subcommand:str]',
      usageDelim: ' ',
    })
  }

  async run (msg, [cmd, subcmd]) {
    const method = this.client.user.bot ? 'author' : 'channel'
    if (cmd) {
      if (subcmd && cmd.subHelps && cmd.subHelps[subcmd]) {
        const sub = cmd.subHelps[subcmd]
        const info = [
          `= ${cmd.name}${cmd.usageDelim || ' '}${sub.name} = `,
          sub.description,
          `usage :: ${sub.usageString}`,
          'Extended Help ::',
          sub.extendedHelp,
        ].join('\n')
        return msg.sendMessage(info, { code: 'asciidoc' })
      }
      const subHelpKeys = Object.keys(cmd.subHelps || {})
      const availableSubHelps = subHelpKeys.length > 0
        ? `sub help available for :: ${subHelpKeys.join(', ')}`
        : ''
      const info = [
        `= ${cmd.name} = `,
        cmd.description,
        `usage :: ${cmd.usage.fullUsage(msg)}`,
        availableSubHelps,
        'Extended Help ::',
        cmd.extendedHelp,
      ].join('\n')
      return msg.sendMessage(info, { code: 'asciidoc' })
    }
    const help = await this.buildHelp(msg)
    const categories = Object.keys(help)
    const helpMessage = []
    for (let cat = 0; cat < categories.length; cat++) {
      helpMessage.push(`**${categories[cat]} Commands**: \`\`\`asciidoc`)
      const subCategories = Object.keys(help[categories[cat]])
      for (let subCat = 0; subCat < subCategories.length; subCat++) helpMessage.push(`= ${subCategories[subCat]} =`, `${help[categories[cat]][subCategories[subCat]].join('\n')}\n`)
      helpMessage.push('```\n\u200b')
    }

    return msg[method].send(helpMessage, { split: { char: '\u200b' } })
      .then(() => { if (msg.channel.type !== 'dm' && this.client.user.bot) msg.sendMessage(msg.language.get('COMMAND_HELP_DM')) })
      .catch(() => { if (msg.channel.type !== 'dm' && this.client.user.bot) msg.sendMessage(msg.language.get('COMMAND_HELP_NODM')) })
  }

  async buildHelp (msg) {
    const help = {}

    const commandNames = Array.from(this.client.commands.keys())
    const longest = commandNames.reduce((long, str) => Math.max(long, str.length), 0)

    await Promise.all(this.client.commands.map((command) =>
      this.client.inhibitors.run(msg, command, true)
        .then(() => {
          if (!help.hasOwnProperty(command.category)) help[command.category] = {}
          if (!help[command.category].hasOwnProperty(command.subCategory)) help[command.category][command.subCategory] = []
          help[command.category][command.subCategory].push(`${msg.guildSettings.prefix}${command.name.padEnd(longest)} :: ${command.description}`)
        })
        .catch(() => {
          // noop
        })
    ))

    return help
  }
}
