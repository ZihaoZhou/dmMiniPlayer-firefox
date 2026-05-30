import WebextEvent from './webextEvent'

export const POPUP_MESSAGE_KIND = 'dmMiniPlayer.popup'

export type PopupMessage =
  | {
      kind: typeof POPUP_MESSAGE_KIND
      event: WebextEvent.hello
    }
  | {
      kind: typeof POPUP_MESSAGE_KIND
      event: WebextEvent.requestVideoPIP
    }
  | {
      kind: typeof POPUP_MESSAGE_KIND
      event: WebextEvent.openSetting
    }
