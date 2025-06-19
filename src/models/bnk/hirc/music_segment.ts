import type { NodeBaseParams } from "./common";

export interface HircMusicSegment {
    music_segment_initial_values: MusicSegmentInitialValues;
}

export interface MusicSegmentInitialValues {
    music_node_params: MusicNodeParams;
    duration: number;
    num_markers: number;
    markers: AkMusicMarkerWwise[];
}

export interface MusicNodeParams {
    flags: number;
    node_base_params: NodeBaseParams;
    children: Children;
    ak_meter_info: AkMeterInfo;
    meter_info_flag: number;
    num_stingers: number;
    stingers: CAkStinger[];
}

export interface Children {
    num_children: number;
    children: number[];
}

export interface AkMeterInfo {
    grid_period: number;
    grid_offset: number;
    tempo: number;
    time_sig_num_beats_bar: number;
    time_sig_beat_value: number;
}

export interface CAkStinger {
    trigger_id: number;
    segment_id: number;
    sync_play_at: number;
    cue_filter_hash: number;
    dont_repeat_time: number;
    num_segment_look_ahead: number;
}

export interface AkMusicMarkerWwise {
    id: number;
    position: number;
    marker_name: string;
}