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
    request_header::RequestHeader,
};

#[derive(Debug, Clone, PartialEq)]
pub struct SetPublishingModeRequest {
    pub request_header: RequestHeader,
    pub publishing_enabled: bool,
    pub subscription_ids: Option<Vec<u32>>,
}

impl MessageInfo for SetPublishingModeRequest {
    fn object_id(&self) -> ObjectId {
        ObjectId::SetPublishingModeRequest_Encoding_DefaultBinary
    }
}

impl BinaryEncoder<SetPublishingModeRequest> for SetPublishingModeRequest {
    fn byte_len(&self) -> usize {
        let mut size = 0;
        size += self.request_header.byte_len();
        size += self.publishing_enabled.byte_len();
        size += byte_len_array(&self.subscription_ids);
        size
    }

    #[allow(unused_variables)]
    fn encode<S: Write>(&self, stream: &mut S) -> EncodingResult<usize> {
        let mut size = 0;
        size += self.request_header.encode(stream)?;
        size += self.publishing_enabled.encode(stream)?;
        size += write_array(stream, &self.subscription_ids)?;
        Ok(size)
    }

    #[allow(unused_variables)]
    fn decode<S: Read>(stream: &mut S, decoding_options: &DecodingOptions) -> EncodingResult<Self> {
        let request_header = RequestHeader::decode(stream, decoding_options)?;
        let publishing_enabled = bool::decode(stream, decoding_options)?;
        let subscription_ids: Option<Vec<u32>> = read_array(stream, decoding_options)?;
        Ok(SetPublishingModeRequest {
            request_header,
            publishing_enabled,
            subscription_ids,
        })
    }
}
