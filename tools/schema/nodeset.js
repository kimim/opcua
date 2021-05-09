let _ = require("lodash");
let xml2js = require("xml2js");
let fs = require("fs");

let util = require("./util");

// Parses an XML node set file and generates a Rust module from it using the config settings

exports.from_xml = (xml_file, rs_module, config) => {
    let modules = [];

    let data = fs.readFileSync(xml_file);

    let parser = new xml2js.Parser();
    parser.parseString(data, (err, xml_data) => {
        console.log(`Generating code for module ${rs_module}`);
        let node_set_modules = exports.generate(xml_file, xml_data, rs_module, config);
        modules.push(...node_set_modules)
    });
    console.log(`modules = ${modules}`);
    return modules;
}

exports.generate = (xml_file, xml_data, rs_module, config) => {
    // Gather up all the nodes in the nodeset
    let nodeset = xml_data["UANodeSet"];

    let alias_map = {};
    if (_.has(nodeset, "Aliases")) {
        _.each(nodeset["Aliases"], node => {
            _.each(node["Alias"], alias => {
                alias_map[alias["$"]["Alias"]] = alias["_"];
            });
        });
    }

    let nodes = [];
    if (_.has(nodeset, "UAObject")) {
        _.each(nodeset["UAObject"], node => {
            nodes.push(["Object", node]);
        });
    }
    if (_.has(nodeset, "UAObjectType")) {
        _.each(nodeset["UAObjectType"], node => {
            nodes.push(["ObjectType", node]);
        });
    }
    if (_.has(nodeset, "UADataType")) {
        _.each(nodeset["UADataType"], node => {
            nodes.push(["DataType", node]);
        });
    }
    if (_.has(nodeset, "UAReferenceType")) {
        _.each(nodeset["UAReferenceType"], node => {
            nodes.push(["ReferenceType", node]);
        });
    }
    if (_.has(nodeset, "UAVariable")) {
        _.each(nodeset["UAVariable"], node => {
            nodes.push(["Variable", node]);
        });
    }
    if (_.has(nodeset, "UAVariableType")) {
        _.each(nodeset["UAVariableType"], node => {
            nodes.push(["VariableType", node]);
        });
    }
    if (_.has(nodeset, "UAMethod")) {
        _.each(nodeset["UAMethod"], node => {
            nodes.push(["Method", node]);
        });
    }

    let max_nodes_per_file = config.max_nodes_per_file || 0;
    // console.log(`max_nodes_per_file = ${max_nodes_per_file}`);

    // Generate source files for the nodeset, ensuring no more than MAX_NODES_PER_FILE
    let modules = [];
    if (max_nodes_per_file == 0 || nodes.length <= max_nodes_per_file) {
        // console.log(`max_nodes_per_file = ${max_nodes_per_file}, nodes.length = ${nodes.length}`);
        modules.push(generate_node_set_files(xml_file, rs_module, 0, nodes, alias_map, config));
    } else {
        let part_nr = 1;
        let node_start = 0;
        while (node_start < nodes.length) {
            let node_slice = nodes.slice(node_start, node_start + max_nodes_per_file);
            modules.push(generate_node_set_files(xml_file, rs_module, part_nr++, node_slice, alias_map, config));
            node_start += max_nodes_per_file;
        }
    }
    return modules;
}

function generate_node_set_files(xml_name, rs_name, part_nr, nodes, alias_map, config) {
    let module_name = part_nr > 0 ? `${rs_name}_${part_nr}` : `${rs_name}`;
    let file_name = `${module_name}.rs`;

    let opcua_server_crate = config.opcua_server_crate ? "opcua_server" : "crate";

    let contents = "";
    if (config.copyright) {
        contents = `// OPCUA for Rust
// SPDX-License-Identifier: MPL-2.0
// Copyright (C) 2017-2020 Adam Lock
`;
    }

            // Process all the nodes
    contents += `// This file was autogenerated from ${xml_name} by ${config.autogenerated_by}
// DO NOT EDIT THIS FILE

#[allow(unused_imports)]
use std::{convert::TryFrom, str::FromStr};

#[allow(unused_imports)]
use ${opcua_server_crate}::{
    address_space::{EventNotifier, types::*},
    prelude::{DataTypeId, ExtensionObject, LocalizedText, NodeId, ReferenceTypeId, service_types::Argument, UAString, Variant, VariantTypeId}
};

`;

    let fn_names = [];
    let idx = 1;
    _.each(nodes, tuple => {
        let node_type = tuple[0];
        let node = tuple[1];
        let fn_name = insert_node_fn_name(idx++, node_type);
        fn_names.push(fn_name);
    });

    contents += "#[allow(unused_variables)]\n";
    contents += `pub fn populate_address_space(address_space: &mut AddressSpace) {\n`;

    let trace = config.trace || false;
    if (trace) {
        contents += `    trace!("Populating address space with node set ${ns.name}");\n`
    }
    _.each(fn_names, fn_name => {
        contents += `    ${fn_name}(address_space);\n`;
    });
    contents += `}\n\n`;

    idx = 0;
    _.each(nodes, tuple => {
        let node_type = tuple[0];
        let node = tuple[1];
        contents += insert_node(fn_names[idx++], node_type, node, alias_map, config);
    });

    util.write_to_file(`${config.destination_dir}/${file_name}`, contents);
    return module_name;
}

function insert_node_fn_name(idx, node_type) {
    return `add_${node_type.toLowerCase()}_${idx}`;
}

function node_id_ctor(snippet, config) {
    // This turns a snippet like "i=2015" or "ns=2;s=Foo" into a node id
    let node_id = util.parse_node_id(snippet);
    if (node_id) {
        let ns = (node_id.ns > 0 && config.namespace_index !== -1) ? config.namespace_index : node_id.ns;
        if (node_id.type === "i") {
            return `NodeId::new(${ns}, ${node_id.value})`;
        } else if (node_id.type === 's') {
            return `NodeId::new(${ns}, "${node_id.value}")`;
        } else {
            // binary / guid types require some kind of parsing. This is easier to do at runtime.
            return `NodeId::from_str("ns=${ns};${node_id.type}=${node_id.value}").unwrap()`;
        }
    } else {
        throw `Invalid node id ${snippet}`;
    }
}

function data_type_node_id(alias_map, data_type, config) {
    let aliased_data_type = _.has(alias_map, data_type) ? alias_map[data_type] : data_type;
    // See if the node_id is ns 0 or something else
    let node_id = util.parse_node_id(aliased_data_type);
    if (node_id) {
        return node_id_ctor(aliased_data_type, config);
    }
    // Plan B
    return `DataTypeId::${data_type}.into()`;
}

function process_argument(extension_object, var_arguments) {
    // Create a value consisting an array of extension objects
    let body = extension_object["Body"][0];

    // InputArguments and OutputArguments will have one of these
    if (_.has(body, "Argument")) {
        // console.log("node_id=" + node_id);
        // console.log("body=" + JSON.stringify(body));

        // Example Argument payload
        /*
            <TypeId>
                <Identifier>i=297</Identifier>
            </TypeId>
            <Body>
                <Argument>
                    <Name>FileHandle</Name>
                    <DataType>
                        <Identifier>i=7</Identifier>
                    </DataType>
                    <ValueRank>-1</ValueRank>
                    <ArrayDimensions />
                    <Description p5:nil="true" xmlns:p5="http://www.w3.org/2001/XMLSchema-instance" />
                </Argument>
            </Body>
        */

        let node_id = "i=298"; // Force to be Argument_Encoding_DefaultBinary not i=297
        let argument = body["Argument"][0];
        let name = argument["Name"][0];
        let data_type = (argument["DataType"][0])["Identifier"][0];
        let value_rank = argument["ValueRank"][0];
        let array_dimensions = "None";
        if (value_rank > 1) {
            console.log("ERROR: Unsupported array dimensions arg");
        } else if (value_rank == 1) {
            console.log("ArrayDimensions is not read in extension object - setting dimensions to 0 which means variable length");
            array_dimensions = "Some(vec![0])"
        }
        var_arguments.push({
            node_id: node_id,
            name: name,
            data_type: data_type,
            value_rank: value_rank,
            array_dimensions: array_dimensions,
        });
    }
}

function insert_node(fn_name, node_type, node, alias_map, config) {
    let contents = `fn ${fn_name}(address_space: &mut AddressSpace) {\n`;
    let indent = "    ";

    contents += `${indent}// ${node_type}\n`;

    let browse_name = _.has(node["$"], "BrowseName") ? node["$"]["BrowseName"] : "";
    let display_name = _.has(node, "DisplayName") ? node["DisplayName"][0] : "";

    let browse_name_var;
    let display_name_var;
    if (browse_name === display_name) {
        // When both display name and browse name are the same we can use the same variable for both
        contents += `${indent}let name = "${browse_name}";\n`;
        browse_name_var = "name";
        display_name_var = "name";
    } else {
        contents += `${indent}let browse_name = "${browse_name}";\n`;
        contents += `${indent}let display_name = "${display_name}";\n`;
        browse_name_var = "browse_name";
        display_name_var = "display_name";
    }

    // Process values
    let node_ctor = "";
    if (node_type === "Object") {
        node_ctor = `Object::new(&node_id, ${browse_name_var}, ${display_name_var}, EventNotifier::empty())`;
    } else if (node_type === "ObjectType") {
        let is_abstract = _.has(node["$"], "IsAbstract") && node["$"]["IsAbstract"] === "true";
        node_ctor = `ObjectType::new(&node_id, ${browse_name_var}, ${display_name_var}, ${is_abstract})`;
    } else if (node_type === "DataType") {
        let is_abstract = _.has(node["$"], "IsAbstract") && node["$"]["IsAbstract"] === "true";
        node_ctor = `DataType::new(&node_id, ${browse_name_var}, ${display_name_var}, ${is_abstract})`;
    } else if (node_type === "ReferenceType") {
        let is_abstract = _.has(node["$"], "IsAbstract") && node["$"]["IsAbstract"] === "true";
        let inverse_name = _.has(node, "InverseName") ? `Some(LocalizedText::new("", "${node["InverseName"][0]}"))` : "None";
        let symmetric = _.has(node["$"], "Symmetric") && node["$"]["Symmetric"] === "true";
        node_ctor = `ReferenceType::new(&node_id, ${browse_name_var}, ${display_name_var}, ${inverse_name}, ${symmetric}, ${is_abstract})`
    } else if (node_type === "Variable") {
        let data_type
        if (_.has(node["$"], "DataType")) {
            data_type = data_type_node_id(alias_map, node["$"]["DataType"], config);
        } else {
            console.log("UAVariable has no data type???");
            data_type = "DataTypeId::Boolean"
        }

        let data_value_is_set = false;
        if (_.has(node, "Value")) {
            let value = node["Value"][0];
            if (_.has(value, "ListOfLocalizedText")) {
                // TODO process ListOfLocalizedText
            }

            if (_.has(value, "ListOfExtensionObject")) {

                // Process ListOfExtensionObject looking for Argument types
                let list = value["ListOfExtensionObject"][0];

                let var_arguments = [];
                _.each(list["ExtensionObject"], extension_object => {
                    process_argument(extension_object, var_arguments);
                });
                if (var_arguments.length > 0) {
                    contents += `${indent}let value = vec![\n`;
                    _.each(var_arguments, a => {
                        contents += `${indent}    Variant::from(ExtensionObject::from_encodable(\n`;
                        contents += `${indent}        ${node_id_ctor(a.node_id, config)}, &Argument {\n`;
                        contents += `${indent}            name: UAString::from("${a.name}"),\n`;
                        contents += `${indent}            data_type: ${node_id_ctor(a.data_type, config)},\n`;
                        contents += `${indent}            value_rank: ${a.value_rank},\n`;
                        contents += `${indent}            array_dimensions: ${a.array_dimensions},\n`;
                        contents += `${indent}            description: LocalizedText::new("", ""),\n`;
                        contents += `${indent}        })),\n`
                    });
                    contents += `${indent}];\n`;
                    data_value_is_set = true;
                }

                // Turn the array of variants into a variant itself and set as the value
            }
        }
        if (!data_value_is_set) {
            contents += `${indent}let value = Variant::Empty;\n`
        }

        let value_tuple = data_value_is_set ? "(VariantTypeId::ExtensionObject, value)" : "value";

        let value_rank = _.has(node["$"], "ValueRank") ? `Some(${node["$"]["ValueRank"]})` : "None";
        let array_dimensions = _.has(node["$"], "ArrayDimensions") ? `Some(${node["$"]["ArrayDimensions"]})` : "None";
        node_ctor = `Variable::new_data_value(&node_id, ${browse_name_var}, ${display_name_var}, ${data_type}, ${value_rank}, ${array_dimensions}, ${value_tuple})`;

    } else if (node_type === "VariableType") {
        let data_type = _.has(node["$"], "DataType") ? data_type_node_id(alias_map, node["$"]["DataType"], config) : "NodeId::null()";
        let is_abstract = _.has(node["$"], "IsAbstract") && node["$"]["IsAbstract"] === "true";
        let value_rank = _.has(node["$"], "ValueRank") ? node["$"]["ValueRank"] : -1;
        node_ctor = `VariableType::new(&node_id, ${browse_name_var}, ${display_name_var}, ${data_type}, ${is_abstract}, ${value_rank})`;
    } else if (node_type === "Method") {
        let executable = true; // TODO
        let user_executable = true; // TODO
        node_ctor = `Method::new(&node_id, ${browse_name_var}, ${display_name_var}, ${executable}, ${user_executable})`;
    }

    let node_id = node["$"]["NodeId"];
    contents += `${indent}let node_id = ${node_id_ctor(node_id, config)};\n`;

    let trace = config.trace || false;
    if (trace) {
        contents += `${indent}trace!("Inserting node id ${node_id}of type ${node_type}");\n`;
    }

    let description = _.has(node, "Description") ? node["Description"][0] : "";
    if (description.length > 0) {
        contents += `${indent}let mut node = ${node_ctor};\n`;
        contents += `${indent}node.set_description(LocalizedText::from("${description}"));\n`;
    } else {
        contents += `${indent}let node = ${node_ctor};\n`;
    }

    let node_references = [];

    // Process other references
    if (_.has(node, "References")) {
        node_references = node_references.concat(get_node_references(node["References"][0], config));
    }
    if (node_references.length > 0) {
        contents += `${indent}let _ = address_space.insert(node, Some(&[\n`;
        _.each(node_references, r => {
            contents += `${indent}    (&${r.node_other}, &${r.reference_type}, ${r.reference_direction}),\n`;
        });
        contents += `${indent}]));\n`;
    } else {
        contents += `${indent}let _ = address_space.insert::<${node_type}, ReferenceTypeId>(node, None);\n`;
    }

    // Process definitions
    if (_.has(node, "Definition")) {
        // TODO process Fields
    }

    // Process InverseName
    indent = indent.substr(0, indent.length - 4);
    contents += `}\n\n`;

    return contents;
}

function get_node_references(reference_element, config) {
    let node_references = [];
    if (_.has(reference_element, "Reference")) {
        _.each(reference_element["Reference"], reference => {
            // Test if the reference is forward or reverse
            let is_forward = !_.has(reference["$"], "IsForward") || reference["$"]["IsForward"] === "true";

            let node_other = node_id_ctor(reference["_"], config);
            let reference_type = reference["$"]["ReferenceType"];
            let reference_direction = is_forward ? "ReferenceDirection::Forward" : "ReferenceDirection::Inverse";

            let node_id = util.parse_node_id(reference_type);
            if (node_id) {
                // TODO
            } else {
                node_references.push({
                    node_other: node_other,
                    reference_type: `ReferenceTypeId::${reference_type}`,
                    reference_direction: reference_direction
                })
            }
        });
    }
    return node_references;
}