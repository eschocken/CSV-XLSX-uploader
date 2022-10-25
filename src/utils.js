import _ from 'lodash';
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

// Supported column types & examples
export const TYPE_SAMPLES = {
    'text': 'Project Impossible',
    'multiple-person': 'eyal@monday.com',
    'color': 'Working On It',
    'date': '2022-10-28',
    'text': 'textual information',
    'dropdown': 'R&D; Procurement;',
    'numeric': '120000',
    'timerange': '2022-07-30-2023-02-10',
    'name': 'Project Alpha',
    'link': 'www.monday.com',
    'email': 'eyal@monday.com'
}

// Returning an example based on a type
export async function getExampleValue(type) {
    return TYPE_SAMPLES[type] || ''
}

// Transforms a row to monday column_values object that can be passed to the API
export function csvRowToColumnValue(csvRow, fieldMapping, users) {
    const columnValues = {};
    csvRow.forEach((value, index) => {
      const csvFieldMap = _.filter(fieldMapping, { csvIndex: index })
      csvFieldMap.forEach(field => {
        switch(field.columnType) {
          case 'multiple-person':
            const user = _.find(users, { email: value });
            columnValues[field.columnId] = {'personsAndTeams': [{'id': user.id, 'kind': 'person'}]};
            break;
          case 'color':
            columnValues[field.columnId] = {'label': value};
            break;
          case 'date':
            columnValues[field.columnId] = {'date': value};
            break;
          case 'text':
            columnValues[field.columnId] = value;
            break;
          case 'dropdown':
            columnValues[field.columnId] = {'labels': value.split(';').map(s => s.trim())};
            break;
          case 'numeric':
            columnValues[field.columnId] = value;
            break;
          case 'timerange':
            const dates = value.match(/([0-9]{4}-[0-9]{2}-[0-9]{2})-([0-9]{4}-[0-9]{2}-[0-9]{2})/)
            console.log('dates',dates);
            columnValues[field.columnId] = {'from': dates[1], 'to': dates[2]};
            break;
          case 'link':
            columnValues[field.columnId] = {'url': value, 'text': value}
            break;
          case 'email':
            columnValues[field.columnId] = {'email': value, 'text': value}
            break;
        }
      })
     })
    return columnValues
}

// Make an API call to retrieve all users within the account
export async function getAllUsers() {
    const query = `query {
        users(limit:10000) {
        id
        email
        }
    }`;
    const response = await monday.api(query);
    return response['data']['users'];
}

// Make an API call to retrieve all IDs in a board from a lookup column ID
export async function getAllIds(boardId, lookupColumnId) {
    if(!boardId) return [];
    const query = `query {
        boards(ids:${boardId}) {
          items {
            id  
            column_values(ids:"${lookupColumnId}") {
              value
            }
          }
        }
    }`;
    const response = await monday.api(query);
    return response['data']['boards'][0]['items'].map(item => {
        return {
            'value': JSON.parse(item.column_values[0]['value']),
            'id':JSON.parse(item.id)
        };
    });
}

// Make an API call to retrieve all column types and names
export async function getColumnData (boardId) {
    const query = `query {
      boards(ids:${boardId}) {
        columns {
          title
          id
          type
        }
      }
    }`
    const response = await monday.api(query);
    return response['data']['boards'][0];
}

// Make an API call to create an item with column values
export async function createItem(boardId, columnValues, itemName) {
    const mutation = `mutation create_item($boardId: Int!, $itemName: String, $columnValue: JSON) {
        create_item(board_id:$boardId, item_name:$itemName, column_values:$columnValue, create_labels_if_missing: true) {
            id
        }
    }`;
    const variables = { boardId:Number(boardId), itemName, columnValue: JSON.stringify(columnValues)};
    return monday.api(mutation, { variables })
    .then((res) => res.data.create_item.id)
    .catch(err=>console.log('err',err));
}

// Make an API call to update an item with column values based on a lookup value
export async function updateItem(boardId, lookupValue, name, columnValues, allIds) {
    console.log('Column Values:', columnValues);
    columnValues['name'] = name;
    let itemId = await getItemByLookup(lookupValue, allIds);
    itemId = itemId.id;

    const mutation = `mutation ($boardId:Int!, $itemId:Int!, $columnValues:JSON!) {
        change_multiple_column_values(item_id:$itemId, board_id:$boardId, column_values: $columnValues, create_labels_if_missing: true) {
            id
        }
    }`;
    const variables = { boardId, itemId, columnValues: JSON.stringify(columnValues) };
    return monday.api(mutation, {variables})
    .then((res) => res.data.change_multiple_column_values.id)
    .catch(error => { console.log('Update Item Error:', error); });
}

// Return an item from a lookup value
const getItemByLookup = async (lookupValue, allIds) => {
    const itemId = allIds.find(item => {
      return item.value === lookupValue
    });
    return itemId;
  };