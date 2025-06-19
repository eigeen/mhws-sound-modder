import type { AkRTPCGraphPoint, NodeBaseParams } from "./common";

export interface HircMusicTrack {
    music_track_initial_values: MusicTrackInitialValues;
}

export interface MusicTrackInitialValues {
    flags: number;
    num_sources: number;
    sources: AkBankSourceData[];
    num_playlist_items: number;
    playlist: AkTrackSrcInfo[];
    num_sub_track?: number;
    num_clip_automations: number;
    clip_automations: AkClipAutomation[];
    node_base_params: NodeBaseParams;
    track_type: AkMusicTrackType;
    switch_params?: SwitchParams;
    trans_params?: TransParams;
    look_ahead_time: number;
}

export interface AkBankSourceData {
    plugin_id: number;
    stream_type: number;
    media_information: AkMediaInformation;
}

export interface AkMediaInformation {
    source_id: number;
    in_memory_media_size: number;
    source_bits: number;
}

export interface AkTrackSrcInfo {
    track_id: number;
    source_id: number;
    event_id: number;
    play_at: number;
    begin_trim_offset: number;
    end_trim_offset: number;
    src_duration: number;
}

export interface AkClipAutomation {
    clip_index: number;
    auto_type: number;
    graph_points_count: number;
    graph_points: AkRTPCGraphPoint[];
}

export enum AkMusicTrackType {
    Normal = 0,
    Random = 1,
    Sequence = 2,
    Switch = 3
}

export interface SwitchParams {
    group_type: number;
    group_id: number;
    default_switch: number;
    num_switch_assoc: number;
    switch_assoc: TrackSwitchAssoc[];
}

export interface TrackSwitchAssoc {
    switch_assoc: number;
}

export interface TransParams {
    src_fade_params: FadeParams;
    sync_type: number;
    cue_filter_hash: number;
    dest_fade_params: FadeParams;
}

export interface FadeParams {
    transition_time: number;
    fade_curve: number;
    fade_offset: number;
}
