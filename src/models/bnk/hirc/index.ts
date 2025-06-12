import { HircMusicRanSecCntr } from './music_ran_sec_cntr'
import { HircMusicSegment } from './music_segment'
import { HircMusicTrack } from './music_track'

export type HircEntry =
  | HircSettingsEntry
  | HircSoundEntry
  | HircEventActionEntry
  | HircEventEntry
  | HircRandomOrSequenceContainerEntry
  | HircSwitchContainerEntry
  | HircActorMixerEntry
  | HircAudioBusEntry
  | HircBlendContainerEntry
  | HircMusicSegmentEntry
  | HircMusicTrackEntry
  | HircMusicSwitchContainerEntry
  | HircMusicRanSeqCntrEntry
  | HircAttenuationEntry
  | HircDialogueEventEntry
  | HircMotionBusEntry
  | HircMotionFxEntry
  | HircEffectEntry
  | HircAuxiliaryBusEntry
  | HircUnknownEntry

interface BaseHircEntry {
  length: number
  id: number
}

export interface HircSettingsEntry extends BaseHircEntry {
  entry_type: HircEntryType.Settings
  data: number[]
}

export interface HircSoundEntry extends BaseHircEntry {
  entry_type: HircEntryType.Sound
  _unk1: number
  _unk2: number
  state: number
  audio_id: number
  source_id: number
  sound_type: HircSoundType
  _unk3: number
  _unk4: number
  game_object_id: number
  data: number[]
}

export interface HircEventActionEntry extends BaseHircEntry {
  entry_type: HircEntryType.EventAction
  scope: HircEventActionScope
  action_type: HircEventActionType
  game_object_id: number
  _unk1: number
  parameter_count: number
  parameter_types: HircEventActionParameterType[]
  parameters: number[]
  _unk2: number
  data: number[]
}

export interface HircEventEntry extends BaseHircEntry {
  entry_type: HircEntryType.Event
  action_ids: number[]
}

export interface HircRandomOrSequenceContainerEntry extends BaseHircEntry {
  entry_type: HircEntryType.RandomOrSequenceContainer
  data: number[]
}

export interface HircSwitchContainerEntry extends BaseHircEntry {
  entry_type: HircEntryType.SwitchContainer
  data: number[]
}

export interface HircActorMixerEntry extends BaseHircEntry {
  entry_type: HircEntryType.ActorMixer
  data: number[]
}

export interface HircAudioBusEntry extends BaseHircEntry {
  entry_type: HircEntryType.AudioBus
  data: number[]
}

export interface HircBlendContainerEntry extends BaseHircEntry {
  entry_type: HircEntryType.BlendContainer
  data: number[]
}

export interface HircMusicSegmentEntry extends BaseHircEntry, HircMusicSegment {
  entry_type: HircEntryType.MusicSegment
}

export interface HircMusicTrackEntry extends BaseHircEntry, HircMusicTrack {
  entry_type: HircEntryType.MusicTrack
}

export interface HircMusicSwitchContainerEntry extends BaseHircEntry {
  entry_type: HircEntryType.MusicSwitchContainer
  data: number[]
}

export interface HircMusicRanSeqCntrEntry extends BaseHircEntry {
  entry_type: HircEntryType.MusicRanSeqCntr
  data: HircMusicRanSecCntr
}

export interface HircAttenuationEntry extends BaseHircEntry {
  entry_type: HircEntryType.Attenuation
  data: number[]
}

export interface HircDialogueEventEntry extends BaseHircEntry {
  entry_type: HircEntryType.DialogueEvent
  data: number[]
}

export interface HircMotionBusEntry extends BaseHircEntry {
  entry_type: HircEntryType.MotionBus
  data: number[]
}

export interface HircMotionFxEntry extends BaseHircEntry {
  entry_type: HircEntryType.MotionFx
  data: number[]
}

export interface HircEffectEntry extends BaseHircEntry {
  entry_type: HircEntryType.Effect
  data: number[]
}

export interface HircAuxiliaryBusEntry extends BaseHircEntry {
  entry_type: HircEntryType.AuxiliaryBus
  data: number[]
}

export interface HircUnknownEntry extends BaseHircEntry {
  entry_type: HircEntryType.Unknown
  data: number[]
}

export enum HircSoundType {
  Sfx = 0,
  Voice = 1,
}

export enum HircEventActionScope {
  SwitchOrTrigger = 1,
  Global = 2,
  GameObject = 3,
  State = 4,
  All = 5,
  AllExcept = 6,
}

export enum HircEventActionType {
  Stop = 1,
  Pause = 2,
  Resume = 3,
  Play = 4,
  Trigger = 5,
  Mute = 6,
  UnMute = 7,
  SetVoicePitch = 8,
  ResetVoicePitch = 9,
  SetVpoceVolume = 10,
  ResetVoiceVolume = 11,
  SetBusVolume = 12,
  ResetBusVolume = 13,
  SetVoiceLowPassFilter = 14,
  ResetVoiceLowPassFilter = 15,
  EnableState = 16,
  DisableState = 17,
  SetState = 18,
  SetGameParameter = 19,
  ResetGameParameter = 20,
  SetSwitch = 21,
  ToggleBypass = 22,
  ResetBypassEffect = 23,
  Break = 24,
  Seek = 25,
  Unknown = 255,
}

export enum HircEventActionParameterType {
  Delay = 0x0e,
  ParamPlay = 0x0f,
  Probability = 0x10,
  Unknown = 255,
}

export enum HircEntryType {
  Settings = 'Settings',
  Sound = 'Sound',
  EventAction = 'EventAction',
  Event = 'Event',
  RandomOrSequenceContainer = 'RandomOrSequenceContainer',
  SwitchContainer = 'SwitchContainer',
  ActorMixer = 'ActorMixer',
  AudioBus = 'AudioBus',
  BlendContainer = 'BlendContainer',
  MusicSegment = 'MusicSegment',
  MusicTrack = 'MusicTrack',
  MusicSwitchContainer = 'MusicSwitchContainer',
  MusicRanSeqCntr = 'MusicRanSeqCntr',
  Attenuation = 'Attenuation',
  DialogueEvent = 'DialogueEvent',
  MotionBus = 'MotionBus',
  MotionFx = 'MotionFx',
  Effect = 'Effect',
  AuxiliaryBus = 'AuxiliaryBus',
  Unknown = 'Unknown',
}
