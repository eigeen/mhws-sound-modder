import type { MusicNodeParams } from "./music_segment";

export interface HircMusicRanSeqCntr {
    music_ran_seq_cntr_initial_values: MusicRanSeqCntrInitialValues;
}

export interface MusicRanSeqCntrInitialValues {
    music_trans_node_params: MusicTransNodeParams;
    num_play_list_items: number;
    play_list_items: AkMusicRanSeqPlaylistItem[];
}

export interface AkMusicRanSeqPlaylistItem {
    segment_id: number;
    play_list_item_id: number;
    num_children: number;
    rs_type: number;
    loop: number;
    loop_min: number;
    loop_max: number;
    weight: number;
    avoid_repeat_count: number;
    is_using_weight: number;
    is_shuffle: number;
    play_list: AkMusicRanSeqPlaylistItem[];
}

export interface MusicTransNodeParams {
    music_node_params: MusicNodeParams;
    num_rules: number;
    rules: AkMusicTransitionRule[];
}

export interface AkMusicTransitionRule {
    num_src: number;
    src_id: number;
    num_dst: number;
    dst_id: number;
    src_rule: AkMusicTransSrcRule;
    dst_rule: AkMusicTransDstRule;
    alloc_trans_object_flag: number;
}

export interface AkMusicTransSrcRule {
    transition_time: number;
    fade_curve: number;
    fade_offset: number;
    sync_type: number;
    cue_filter_hash: number;
    play_post_exit: number;
}

export interface AkMusicTransDstRule {
    transition_time: number;
    fade_curve: number;
    fade_offset: number;
    cue_filter_hash: number;
    jump_to_id: number;
    jump_to_type: number;
    entry_type: number;
    play_pre_entry: number;
    dest_match_source_cue_name: number;
}
