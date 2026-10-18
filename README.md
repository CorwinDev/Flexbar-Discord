# Discord for FlexBar

Control the Discord desktop app from FlexBar: toggle your microphone, deafen or
undeafen, toggle your camera, and play soundboard sounds.

This fork of [CorwinDev/Flexbar-Discord](https://github.com/CorwinDev/Flexbar-Discord)
adds connection recovery, token renewal, voice-state indicators and soundboard
button artwork.

## Requirements

- FlexBar and FlexDesigner, or a compatible plugin host.
- The Discord **desktop app**, running on the same computer as the plugin host.
- A Discord application with RPC access for your account.

The plugin connects to Discord locally over IPC. The Discord web client cannot
provide this connection. Authentication uses your application's Client ID and
Client Secret, rather than a bot token.

## Setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Open its **OAuth2** settings and copy the **Client ID** and **Client Secret**.
3. In FlexDesigner, open **Settings → Application → Discord**.
4. Enter the credentials and click **Authenticate**. This saves the credentials
   before connecting.
5. Approve the authorization prompt in Discord and wait for **Connected to Discord**.
6. Add Discord controls to your profile, then save and sync it to FlexBar.

RPC access is restricted by Discord. If authorization is denied, check the
application's access and approved testers before changing credentials. See
[Discord's RPC documentation](https://docs.discord.com/developers/topics/rpc#restrictions).

**Save** stores the application credentials. **Authenticate** connects and starts
consent when necessary. **Disconnect** stops automatic reconnection and removes
the saved authorization tokens. Changing the application credentials also clears
the previous authorization.

The Client Secret and authorization tokens are stored in the host's plugin
configuration. Keep that configuration private.

## Controls

| Control    | Behavior                                                             |
| ---------- | -------------------------------------------------------------------- |
| Microphone | Toggles mute. Its indicator also shows blocked audio while deafened. |
| Headphones | Toggles deafen.                                                      |
| Camera     | Toggles video through Discord RPC.                                   |
| Soundboard | Plays the sound selected in that button's settings.                  |

Microphone and headphones indicators follow Discord's current state, including
changes made outside FlexBar. A question mark means the state is unknown or
Discord is disconnected. Existing custom state styles are preserved.

### Choosing a sound

1. Add a **Trigger Soundboard** key and select it in the editor.
2. In its **Functions** form, choose a sound. Default Discord sounds appear first,
   followed by server groups; group headings are not selectable.
3. The key's title and artwork update from the chosen sound. Unicode emoji and
   custom emoji are supported; animated custom emoji use a static PNG.
4. Save and sync the profile. The choice belongs to that key, independently of
   other soundboard keys.

Global plugin settings contain connection controls. Sound selection belongs in
the key editor. Unavailable sounds cannot be selected; an unconfigured key does
not play a default sound. Playback still depends on Discord's voice-channel
state and permissions.

## Connection behavior

Saved sessions reconnect after Discord restarts, and access tokens renew using
the saved refresh token. Revoked authorization requires **Authenticate** again.
Older saved sessions without a refresh token may also need reauthorization.

A failed action reports an error without replacing the button's artwork. An
ambiguous timed-out action is not automatically replayed.

Camera and soundboard use private Discord RPC commands. Discord updates can
change their availability even when authorization and voice controls work.

## Development

Use Bun for dependency installation and scripts, with Node.js 20 or newer
available for the backend and development tools.

```sh
bun install
bun run build
```

Installation applies the SDK patches through the project's `postinstall` script.
The build produces `com.corwindev.discord.plugin/backend/plugin.cjs` and its
source map. Building alone does not install or restart the plugin.

To validate, package or install the plugin, make `flexcli` available on your PATH:

```sh
bun add --global @eniac/flexcli
bun run plugin:validate
bun run plugin:pack
```

Packing creates `com.corwindev.discord.flexplugin`. Import that file into
FlexDesigner, or install it with:

```sh
bun run plugin:install
```

The install command uses `--force` to replace the installed plugin package.

| Command                  | Purpose                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `bun run dev`            | Relink this checkout in FlexDesigner, watch files, restart on changes and stream debug output. |
| `bun run plugin:watch`   | Watch and rebuild; restart the linked plugin after each build.                                 |
| `bun run plugin:restart` | Restart the linked plugin.                                                                     |
| `bun run plugin:debug`   | Open the plugin's debug output.                                                                |
| `bun run format`         | Format backend sources, Vue forms and build configuration with Prettier.                       |
| `bun run format:check`   | Check formatting without rewriting files.                                                      |

### SDKs and patches

The backend uses `@eniac/flexdesigner@1.0.3` and `@corwinjs/rpcord@1.2.0`.
The plugin handles authorization persistence and button behavior; the SDKs
provide host messaging and Discord IPC.

Both versions are pinned. Fixes for packet handling, connection cleanup and
request lifetimes are kept in [`patches/`](patches/README.md) and applied by
`patch-package`. Review those patches when updating either SDK. Packaged plugin
users do not need to apply patches separately.

Rollup can report circular dependencies inside the SDK's logging dependencies
(`readable-stream`, `async`, `winston`). These warnings are not filtered. They do
not by themselves mean the build failed; check for the final `created` message
and a successful exit status.

## Troubleshooting

| Problem                                       | What to check                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Discord cannot be found                       | Start the desktop app on the host computer. Check that the host can access its IPC socket.       |
| Authorization fails                           | Check the Client ID/Secret, Discord's consent prompt and the application's RPC/tester access.    |
| Reauthorization is required                   | Click Authenticate; the saved grant may have expired or been revoked.                            |
| Sound list is empty or a sound cannot play    | Check the connection, voice-channel membership, sound availability and Discord permissions.      |
| Sound choice or artwork is missing on FlexBar | Save and sync the edited profile; selecting a sound does not upload it automatically.            |
| SDK patches fail during installation          | Check the pinned dependency versions and patch output. See the SDK patch notes before upgrading. |
