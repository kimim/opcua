// OPCUA for Rust
// SPDX-License-Identifier: MPL-2.0
// Copyright (C) 2017-2020 Adam Lock

// This file was autogenerated from Opc.Ua.Types.bsd.xml by tools/schema/gen_types.js
// DO NOT EDIT THIS FILE
#![allow(unused_attributes)]

use std::io::{Read, Write};

#[allow(unused_imports)]
use crate::{
    encoding::*,
    basic_types::*,
    service_types::impls::MessageInfo,
    node_ids::ObjectId,
    status_codes::StatusCode,
    extension_object::ExtensionObject,
};

#[derive(Debug, Clone, PartialEq)]
pub struct MonitoredItemCreateResult {
    pub status_code: StatusCode,
    pub monitored_item_id: u32,
    pub revised_sampling_interval: f64,
    pub revised_queue_size: u32,
    pub filter_result: ExtensionObject,
}

impl MessageInfo for MonitoredItemCreateResult {
    fn object_id(&self) -> ObjectId {
        ObjectId::MonitoredItemCreateResult_Encoding_DefaultBinary
    }
}

impl BinaryEncoder<MonitoredItemCreateResult> for MonitoredItemCreateResult {
    fn byte_len(&self) -> usize {
        let mut size = 0;
        size += self.status_code.byte_len();
        size += self.monitored_item_id.byte_len();
        size += self.revised_sampling_interval.byte_len();
        size += self.revised_queue_size.byte_len();
        size += self.filter_result.byte_len();
        size
    }

    #[allow(unused_variables)]
    fn encode<S: Write>(&self, stream: &mut S) -> EncodingResult<usize> {
        let mut size = 0;
        size += self.status_code.encode(stream)?;
        size += self.monitored_item_id.encode(stream)?;
        size += self.revised_sampling_interval.encode(stream)?;
        size += self.revised_queue_size.encode(stream)?;
        size += self.filter_result.encode(stream)?;
        Ok(size)
    }

    #[allow(unused_variables)]
    fn decode<S: Read>(stream: &mut S, decoding_options: &DecodingOptions) -> EncodingResult<Self> {
        let status_code = StatusCode::decode(stream, decoding_options)?;
        let monitored_item_id = u32::decode(stream, decoding_options)?;
        let revised_sampling_interval = f64::decode(stream, decoding_options)?;
        let revised_queue_size = u32::decode(stream, decoding_options)?;
        let filter_result = ExtensionObject::decode(stream, decoding_options)?;
        Ok(MonitoredItemCreateResult {
            status_code,
            monitored_item_id,
            revised_sampling_interval,
            revised_queue_size,
            filter_result,
        })
    }
}
