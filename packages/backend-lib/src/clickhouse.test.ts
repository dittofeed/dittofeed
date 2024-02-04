import { command } from "./clickhouse";

describe("foo", () => {
  it("bar", async () => {
    const query = `
  insert into computed_property_assignments_v2
  select
      workspace_id,
      type,
      computed_property_id,
      user_id,
      False as segment_value,
      last_value[{8439489c_1c24_4135_9e22_d7d25015da00:String}] as user_property_value,
      arrayReduce('max', mapValues(max_event_time)),
      toDateTime64(1707018124.108, 3) as assigned_at
  from (
      select
      workspace_id,
      type,
      computed_property_id,
      user_id,
      CAST((groupArray(state_id), groupArray(last_value)), 'Map(String, String)') as last_value,
      CAST((groupArray(state_id), groupArray(unique_count)), 'Map(String, Int32)') as unique_count,
      CAST((groupArray(state_id), groupArray(max_event_time)), 'Map(String, DateTime64(3))') as max_event_time,
      CAST(
          (
          groupArray(state_id),
          groupArray(events)
          ),
          'Map(String, Array(Tuple(String, DateTime64(3), String)))'
      ) as grouped_events
      from (
      select
          inner2.workspace_id as workspace_id,
          inner2.type as type,
          inner2.computed_property_id as computed_property_id,
          inner2.state_id as state_id,
          inner2.user_id as user_id,
          inner2.last_value as last_value,
          inner2.unique_count as unique_count,
          inner2.max_event_time as max_event_time,
          groupArray((inner2.event, inner2.event_time, inner2.properties)) as events
      from (
          select
          inner1.workspace_id as workspace_id,
          inner1.type as type,
          inner1.computed_property_id as computed_property_id,
          inner1.state_id as state_id,
          inner1.user_id as user_id,
          inner1.last_value as last_value,
          inner1.unique_count as unique_count,
          inner1.max_event_time as max_event_time,
          ue.event as event,
          ue.event_time as event_time,
          ue.properties as properties
          from user_events_v2 ue
          right any join (
          select
              workspace_id,
              type,
              computed_property_id,
              state_id,
              user_id,
              argMaxMerge(last_value) last_value,
              uniqMerge(unique_count) unique_count,
              maxMerge(max_event_time) max_event_time,
              arrayJoin(groupArrayMerge(cps.grouped_message_ids)) message_id
          from computed_property_state cps
          where
              (
              workspace_id,
              type,
              computed_property_id,
              state_id,
              user_id
              ) in (
              select
                  workspace_id,
                  type,
                  computed_property_id,
                  state_id,
                  user_id
              from updated_computed_property_state
              where
                  workspace_id = {fbfd4e13_b369_44ec_acae_08c13add1832:String}
                  and type = 'user_property'
                  and computed_property_id = {0dbeea50_6293_40d1_b3b5_11b256e1ab52:String}
                  and computed_at <= toDateTime64(1707018124.108, 3)
                  and ((state_id in {85850e00_6852_4114_9690_578199800619:Array(String)} and computed_at >= toDateTime64(1707018027.586, 3)))
              )
          group by
              workspace_id,
              type,
              computed_property_id,
              state_id,
              user_id
          ) as inner1 on
          inner1.message_id != ''
          and inner1.message_id = ue.message_id
          group by
          workspace_id,
          type,
          computed_property_id,
          state_id,
          user_id,
          last_value,
          unique_count,
          max_event_time,
          event,
          event_time,
          properties
      ) inner2
      group by
          workspace_id,
          type,
          computed_property_id,
          state_id,
          user_id,
          last_value,
          unique_count,
          max_event_time
      ) inner3
      group by
      workspace_id,
      type,
      computed_property_id,
      user_id
  ) inner4
    `;
    await command({
      query,
      query_params: {
        "8439489c_1c24_4135_9e22_d7d25015da00": "state_id1",
        fbfd4e13_b369_44ec_acae_08c13add1832: "workspace_id1",
        "0dbeea50_6293_40d1_b3b5_11b256e1ab52": "computed_property_id1",
        "85850e00_6852_4114_9690_578199800619": ["state_id1"],
      },
    });

    expect(1).toBe(1);
  });
});
