# Note - this app is not maintained by monday.com and is only used for reference.

# Installing the app
In project directory:
1. Clone the repository 
2. Run ```npm install ```
3. Run ```npm run build ```
4. Compress the build folder that was created to build.zip

In your monday account:
1. Click on your monday avatar-->Developers-->Create App
2. Give a name to the app
3. Under OAuth, grant the following scopes: boards:read, boards:write, workspaces:read, workswpaces:write, users:read
4. Create a new feature of type Board View
5. Name the feature and upload the build.zip file generated
6. Add the board view app to your board and start uploading files (there are sample files under the sample files folder)
