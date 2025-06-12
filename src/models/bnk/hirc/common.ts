export interface NodeBaseParams {
    node_initial_fx_params: NodeInitialFxParams;
    is_override_parent_metadata: number;
    num_fx: number;
    override_attachment_params: number;
    override_bus_id: number;
    direct_parent_id: number;
    by_bit_vector: number;
    node_initial_params: NodeInitialParams;
    positioning_params: PositioningParams;
    aux_params: AuxParams;
    adv_settings_params: AdvSettingsParams;
    state_chunk: StateChunk;
    initial_rtpc: InitialRTPC;
}

export interface NodeInitialFxParams {
    is_override_parent_fx: number;
    num_fx: number;
}

export interface NodeInitialParams {
    ak_prop_bundle1: AkPropBundle;
    ak_prop_bundle2: AkPropBundle;
}

export interface AkPropBundle {
    num_props: number;
    props: AkPropBundleElem[];
}

export interface AkPropBundleElem {
    p_id: number;
    p_value: number;
}

export interface PositioningParams {
    bits_positioning: number;
    bits_3d: number;
    is_dynamic: number;
    e_path_mode: AkPathMode;
    transition_time: number;
    vertices: AkPathVertex[];
    play_list_items: AkPathListItemOffset[];
    params: Ak3DAutomationParams[];
}

export enum AkPathMode {
    StepSequence = 0,
    StepRandom = 1,
    ContinuousSequence = 2,
    ContinuousRandom = 3,
    StepSequencePickNewPath = 4,
    StepRandomPickNewPath = 5
}

export interface AkPathVertex {
    vertex_x: number;
    vertex_y: number;
    vertex_z: number;
    duration: number;
}

export interface AkPathListItemOffset {
    vertices_offset: number;
    num_vertices: number;
}

export interface Ak3DAutomationParams {
    x_range: number;
    y_range: number;
    z_range: number;
}

export interface AuxParams {
    by_bit_vector: number;
    aux_ids?: [number, number, number, number];
    reflections_aux_bus: number;
}

export interface AdvSettingsParams {
    by_bit_vector: number;
    virtual_queue_behavior: number;
    max_num_instance: number;
    below_threshold_behavior: number;
    by_bit_vector2: number;
}

export interface AkStatePropertyInfo {
    property_id: number;
    accum_type: number;
    in_db: number;
}

export interface AkState {
    state_id: number;
    state_instance_id: number;
}

export interface AkStateGroupChunk {
    state_group_id: number;
    state_sync_type: number;
    num_states: number;
    states: AkState[];
}

export interface StateChunk {
    num_state_props: number;
    state_props: AkStatePropertyInfo[];
    num_state_groups: number;
    state_groups: AkStateGroupChunk[];
}

export interface InitialRTPC {
    num_curves: number;
    curves: InitialRTPCCurve[];
}

export interface InitialRTPCCurve {
    rtpc_id: number;
    rtpc_type: number;
    rtpc_accum: number;
    param_id: number;
    rtpc_curve_id: number;
    e_scaling: number;
    size: number;
    rtpc_mgr: AkRTPCGraphPoint[];
}

export interface AkRTPCGraphPoint {
    from: number;
    to: number;
    interp: number;
}