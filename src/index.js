import React, { useCallback, useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { useDropzone } from "react-dropzone";
import csv from "csv";
import * as XLSX from 'xlsx'
import { Button, Dropdown, Flex, Toast, IconButton, Loader, Tooltip } from "monday-ui-react-core";
import { Favorite } from "monday-ui-react-core/dist/allIcons";
import { csvRowToColumnValue, createItem, updateItem, TYPE_SAMPLES, getExampleValue, getAllUsers, getColumnData, getAllIds } from './utils.js';
import mondaySdk from "monday-sdk-js";
import { Promise } from "bluebird";
import _, { indexOf } from 'lodash';
import "./styles.css";
import "monday-ui-react-core/dist/main.css"

const monday = mondaySdk();

function App() {
  const [data, setData] = useState([]);
  const [lookupSelected, setLookupRow] = useState(-1)
  const [lookupColumnId, setLookupId] = useState('');
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [boardId, setBoardId] = useState('');
  const [columns, setColumns] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [fieldMapping, setMapping] = useState([]);
  const [users, setUsers] = useState([])
  const [error, setError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [uploadSummary, setUploadSummary] = useState([]);

  const handleLookupClick = (i, cid) => {
    setLookupRow(i);
    setLookupId(cid);
  }

  const handleUploadClick = () => {
    setConfirmDialog(true);
  }

  const handleMappingSelection = (columnId, csvIndex, columnType) => {
    if(csvIndex !== '') setMapping([...fieldMapping, {columnId, csvIndex, columnType}]);
    else setMapping(_.remove(fieldMapping, e => e.columnId !== columnId));
    return;
  }

  //** Handler for file drag & drop */
  const onDrop = useCallback(acceptedFiles => {
    const reader = new FileReader();
    const rABS = !!reader.readAsBinaryString;
    let fileExt;

    reader.onabort = () => setError('File reading was aborted');
    reader.onerror = () => setError('File reading has failed');
    reader.onload = (e) => {
      //** Parse CSV */
      if(fileExt === 'csv') { 
        csv.parse(reader.result, {encoding: 'utf8', quote: '', ltrim: true, rtrim: true, delimiter: ',' }, (err, csvdata) => {
          const headers = csvdata.shift();
          setHeaders(headers.map(value => { return { value: indexOf(headers, value), label: value }}));
          setData(csvdata); 
        });
      }
      //** Parse XLSC */
      if(fileExt === 'xlsx') {
        const bstr = e.target.result;
        const wb = XLSX.read(bstr, { type: rABS ? "binary" : "array" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const headers = data.shift();
        setHeaders(headers.map(value => { return { value: indexOf(headers, value), label: value }}));
        setData(_.filter(data, (row) => row.length > 0));
      }
    };

    //** Read files on upload */
    acceptedFiles.forEach(file => {
      fileExt = file.name.split('.').pop();
      if(fileExt === 'csv') reader.readAsText(file)
      else if(fileExt === 'xlsx') {
        if (rABS) reader.readAsBinaryString(file);
        else reader.readAsArrayBuffer(file);
      }
      else setError('Invalid file extension. Only .csv & .xlsx are supported.')
    });
  }, [boardId]);

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  useEffect(() => {
    async function setBoardID() {
      //** Get context and board ID */
      const context = await monday.get("context");
      const boardId = context.data.boardId;
      const columnData = await getColumnData(boardId);
      const users = await getAllUsers();
      setUsers(users);

      //** Transform and set column data */
      const columnsData = columnData.columns.map(item => {
        return {
          id: item.id,
          label: item.title,
          type: item.type
        };
      }).filter(column => Object.keys(TYPE_SAMPLES).indexOf(column.type) >= 0);
      setColumns(columnsData)
      setBoardId(boardId);
      setLoading(false)
    }
    setBoardID();
  }, [loading])

  const increment = () => {
    setProgress(progress=>progress+1);
  }

  const upload = async () => {
    try {
      setProgress(0);
      //** Get all existing items IDs in board */
      const allIds = await getAllIds(boardId, lookupColumnId);

      const createdIds = [];
      const updatedIds = [];
      //** If value under lookup column ID doesn't exist in the board, we will create it */
      const createData = _.differenceWith(data, allIds, (row,item) => {
        return row[_.find(fieldMapping, {columnId: lookupColumnId}).csvIndex] === item.value // change to lookup dynamically
      });
      //** If value under lookup column ID exists in the board, we will update it */
      const updateData = _.intersectionWith(data, allIds, (row,item) => {
        return row[_.find(fieldMapping, {columnId: lookupColumnId}).csvIndex] === item.value // change to lookup dynamically
      });
      const failedIds = [];

      // Logging the data created & updated
      console.log('Data to be created:', createData);
      console.log('Data to be updated:', updateData);
      
      Promise.map(createData, async function(row, i) {
        try {
        const columnValues = csvRowToColumnValue(row, fieldMapping, users);
        const itemName = row[_.find(fieldMapping, { columnType: 'name' }).csvIndex];
        return createItem(boardId, columnValues, itemName)
        .then((itemId)=>{
          if(itemId) {
            createdIds.push(itemId);
            increment()
          }
        })
        } catch(err) {
            failedIds.push(i);
            increment();
        }
      }, {concurrency: 1})
      .then(()=> {
        Promise.map(updateData, async function(row, i) {
          try {
          //** Transform the row data, get the target item name and call updateItem mutation */
          const columnValues = csvRowToColumnValue(row, fieldMapping, users);
          const itemName = row[_.find(fieldMapping, { columnType: 'name' }).csvIndex];
          const lookupValue = row[_.find(fieldMapping, {columnId: lookupColumnId}).csvIndex];
          return updateItem(boardId, lookupValue, itemName, columnValues, allIds)
          .then((itemId)=>{
            if(itemId) {
              updatedIds.push(itemId);
              increment()
            }
          })
          } catch(err) {
              failedIds.push(i);
              increment();
          }
        }, {concurrency: 1})
        //** Store summary to show user at the end of upload */
        .then(()=>setUploadSummary([createdIds, updatedIds, failedIds]));
      })
    } catch(error) {
      setError('Something is wrong. Are you sure the CSV values are in the right format?')
    }
  }

  //** Clear all stored data */
  const clearData = () => {
    setData([]);
    setProgress(0);
    setUploadSummary([]);
    setMapping([]);
    lookupSelected(-1);
  };

  return (
    <div className="App">
      <div>
        {(loading || progress > 0) && uploadSummary.length == 0 && <div className="loader monday-storybook-loader_size-variants_container">
          <Loader size={Loader.sizes.MEDIUM} />
        </div>}
        {(!loading) && data.length <= 0 &&
          <>
            <div className="dropzone">
              <div {...getRootProps()}>
              <input {...getInputProps()} />
              <p>Click or drop a file</p>
              </div>
            </div>
          </>
        }
        {data.length > 0 && progress == 0 && <>
        <div>
        {columns.length > 0 &&
          <Flex style={{
            width: "100%"
          }} justify={Flex.justify.SPACE_AROUND}>
            <div className="iconSelector"></div>
            <div className="columnInfo"><h3>Column Title</h3></div>
            <div className="columnInfo"><h3>Column Type</h3></div>
            <div className="csvSelector"><h3>Header</h3></div>
          </Flex>}
        {columns.map((column, i) => (<div key={i} className={lookupSelected===i ? "lookupActive" : ""}>
          <Flex style={{
            width: "100%"
          }} justify={Flex.justify.SPACE_AROUND}>
          <div className="iconSelector" onClick={()=>column.type === 'text' && handleLookupClick(i, column.id)}><IconButton disabled={column.type !== 'text'} active={lookupSelected===i} ariaLabel={(column.type !== 'text') ? 'Only text columns are supported as a lookup field' : 'Set as lookup field'} icon={Favorite} onClick={()=>handleLookupClick(i)}/></div>
          <div className="columnInfo">{column.label}</div>  
          <Tooltip content={getExampleValue(column.type)}>
            <div className="columnInfo">{(column.type === 'color') ? 'status' : column.type}</div>
          </Tooltip>
          <Dropdown size={Dropdown.size.SMALL} options={headers} className="csvSelector" onChange={(selection)=>{handleMappingSelection(column.id,(selection) ? selection.value : '', column.type)}}/>
          </Flex>
        </div>
        ))}
        </div>
        <Flex className="buttons" justify={Flex.justify.CENTER} gap={Flex.gaps.MEDIUM}>
        <Button onClick={()=>handleUploadClick()}>Upload</Button>
        <Button onClick={clearData}>Cancel</Button>
        </Flex>
        </>}
        {progress > 0 && uploadSummary.length == 0 && <div>Updating {progress} / {data.length}</div>}
        {confirmDialog && <Toast
          onClose={()=>setConfirmDialog(false)}
          actions={[
            {
              content: 'Proceed',
              type: 'button',
              onClick: ()=> { setConfirmDialog(false); upload()}
            }
          ]}
          className="monday-storybook-toast_wrapper"
          open
        >
          {lookupSelected >= 0 ? `This will upload ${data.length} entries.` : `No lookup field selected! This will create ${data.length} entries`}

        </Toast>}
        {error && <Toast
          onClose={()=>setError('')}
          className="monday-storybook-toast_wrapper"
          open
          type={Toast.types.NEGATIVE}
          autoHideDuration={3000}
        >
          {error}
        </Toast>}
        { uploadSummary.length > 0 && error.length <= 0 && <div>
          <div>{uploadSummary[0].length} entries were created</div>
          <div>{uploadSummary[1].length} entries were updated</div>
          <div>{uploadSummary[2].length} entries failed. {uploadSummary[2].length > 0 && `Rows ${JSON.stringify(uploadSummary[2])}`}</div>
          <div><Button onClick={()=>clearData()}>Upload another file</Button></div>
          </div>
        }
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);
