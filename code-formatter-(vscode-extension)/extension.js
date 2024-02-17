
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const esprima = require("esprima");
const estraverse = require("estraverse");
const escodegen = require("escodegen");
const axios = require("axios");
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
// const OpenAI = require("openai");
// const apiKey = "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";
// // @ts-ignore
// const openai = new OpenAI({ apiKey: apiKey });

let changes = [];
let renamedFolders = [];
let filepath =[];


// async function suggestCamelCaseName(str) {
//   try {
//     const completion = await openai.chat.completions.create({
//       messages: [
//         { role: "system", content: "You are a helpful assistant." },
//         { role: "user", content: `Please convert  ${str} to pascalCase i need only oneword as response dont give any explanation ex if i give call the response should be only Call not any other ` },
//       ],
//       model: "gpt-3.5-turbo",
//     });

//     const response = await completion.choices[0].message.content.trim();
//     console.log("CamelCase Conversion:", response);
//     return response;
//   } catch (error) {
//     console.error("Error during API request:", error);
//     return str; // Fallback to the original string in case of error
//   }
// }


function updateComponentNames(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx']
  });
  // const changes = [];
 
      traverse(ast, {
          JSXOpeningElement(path) {
              console.log(path,"pathhhe")
              // @ts-ignore
              let elementName = path.node.name.name;
              changes.forEach(change => {
                  if (elementName === change.oldName) {
                    // @ts-ignore
                      path.node.name.name = change.newName;
                  }
              });
          },
          JSXAttribute(path) {
            // Check if the attribute value is a JSX expression
            if (path.node.value && path.node.value.type === 'JSXExpressionContainer') {
                let expression = path.node.value.expression;
                // Check if the expression is an identifier (function reference)
                if (expression.type === 'Identifier') {
                    let functionName = expression.name;
                    changes.forEach(change => {
                        if (functionName === change.oldName) {
                            // @ts-ignore
                            expression.name = change.newName;
                        }
                    });
                }
            }
        },
          ImportDeclaration(path) {
            path.node.specifiers.forEach(specifier => {
                // @ts-ignore
                if (specifier.type === 'ImportSpecifier'  && specifier.imported && specifier.imported.name ) {
                    // @ts-ignore
                    let importedName = specifier.imported.name;
                    changes.forEach(change => {
                        if (importedName === change.oldName) {
                            // @ts-ignore
                            specifier.imported.name = change.newName;
                            specifier.local.name = change.newName;
                        }
                    });
                } else if (specifier.type === 'ImportDefaultSpecifier') {
                    let importedName = specifier.local.name;
                    changes.forEach(change => {
                        if (importedName === change.oldName) {
                            specifier.local.name = change.newName;
                        }
                    });
                }
            });
        },
        CallExpression(path) {
          // Check if the callee is an Identifier
          if (path.node.callee.type === 'Identifier') {
              let calleeName = path.node.callee.name;
              changes.forEach(change => {
                  if (calleeName === change.oldName) {
                      // @ts-ignore
                      path.node.callee.name = change.newName;
                  }
              });
          }
      }
      });
  

  const updatedCode = generate(ast, {}, code).code;
  fs.writeFileSync(filePath, updatedCode);
}

function renameFoldersAndFiles(rootPath) {
  fs.readdirSync(rootPath, { withFileTypes: true }).forEach(dirent => {
      const oldPath = path.join(rootPath, dirent.name);
      if (dirent.isDirectory()) {
          renameFoldersAndFiles(oldPath);
          const newPath = path.join(rootPath, dirent.name.toLowerCase());
          if (oldPath !== newPath) {
              fs.renameSync(oldPath, newPath);
          }
      }
      else {
        const newPath = path.join(rootPath, toPascalCase(dirent.name));
        if (oldPath !== newPath) {
            fs.renameSync(oldPath, newPath);
        }
    }  });
}

function toPascalCase(str) {
  console.log("pascal",str)
  if(str === 'index.js' || str === 'index.css'){
    return str;
  }
  else{
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}
}

function updateImportPaths(dirPath) {
  console.log("update import",dirPath)
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);

      if (stats.isDirectory()) {
          updateImportPaths(filePath);
      } else if (file.endsWith('.js')) {
          filepath.push(filePath);
          const code = fs.readFileSync(filePath, 'utf8');
          const updatedCode = initialUpdateCode(code);
          fs.writeFileSync(filePath, updatedCode);
      }
  });
}

function initialUpdateCode(sourceCode) {
  const ast = parser.parse(sourceCode, {
      sourceType: 'module',
      plugins: ['jsx']
  });

  // let changes = []; // This array will hold the changes

  traverse(ast, {
      ImportDeclaration(path) {
          let l = convertToPascalCase(path.node.source.value)
          console.log("l --------> ",l)
          path.node.source.value =l
      },
      FunctionDeclaration(path) {
          let oldName = path.node.id.name;
          let newName = toPascalCase(oldName);
          path.node.id.name = newName;
          changes.push({ oldName, newName });
      },
      FunctionExpression(path) {
          if (path.node.id) {
              let oldName = path.node.id.name;
              let newName = toPascalCase(oldName);
              path.node.id.name = newName;
              changes.push({ oldName, newName });
          }
      },
      ArrowFunctionExpression(path) {
          let oldName, newName;
          if (path.parentPath.isVariableDeclarator() && path.parentPath.node.id.type === 'Identifier') {
              oldName = path.parentPath.node.id.name;
              newName = toPascalCase(oldName);
              path.parentPath.node.id.name = newName;
              changes.push({ oldName, newName });
          } else if (path.parentPath.isAssignmentExpression() && path.parentPath.node.left.type === 'Identifier') {
              oldName = path.parentPath.node.left.name;
              newName = toPascalCase(oldName);
              path.parentPath.node.left.name = newName;
              changes.push({ oldName, newName });
          }
      },
      ExportNamedDeclaration(path) {
          path.node.specifiers.forEach(specifier => {
              if (specifier.type === 'ExportSpecifier') {
                  changes.forEach(change => {
                      // @ts-ignore
                      if (specifier.local.name === change.oldName) {
                          // @ts-ignore
                          specifier.exported.name = change.newName;
                          specifier.local.name = change.newName;
                      }
                  });
              }
          });
      },
      ExportDefaultDeclaration(path) {
          if (path.node.declaration.type === 'Identifier') {
              changes.forEach(change => {
                  // @ts-ignore
                  if (path.node.declaration.name === change.oldName) {
                      // @ts-ignore
                      path.node.declaration.name = change.newName;
                  }
              });
          }
      }
  });

  return generate(ast, {}, sourceCode).code;
}

function convertToPascalCase(str) {
  if (str.startsWith(".")) {
      let parts = str.split('/');
      let lastPart = parts.pop(); // Extract the last part

      // Check if the last part is a file (has an extension)
      if (lastPart.includes('.')) {
          // Convert the file part to PascalCase
          lastPart = lastPart.split('.').map((p, index) => {
              // Only capitalize the first letter of the file name, not the extension
              if(p!="index"){
                return index === 0 ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p.toLowerCase();
              }
              return index === 0 ? p.toLowerCase() : p.toLowerCase();
          }).join('.');
      } else {
          // If it's not a file, convert the last part to lowercase
          if(lastPart != "index"){
            lastPart = toPascalCase(lastPart);
          }
         
      }

      // Convert the directory parts to lowercase
      let dirParts = parts.map(part => part.toLowerCase());

      // Reassemble the full path
      dirParts.push(lastPart);
      return dirParts.join('/');
  }
  return str;
}


function crispCode(rootPath){
  console.log(rootPath);
  renameFoldersAndFiles(rootPath);
  updateImportPaths(rootPath);
  filepath.map((fp)=>{
    // finalUpdateCode(fp);
    updateComponentNames(fp);
  })

  console.log("changes ----->",changes);
  // console.log("file ---->",filepath);
  
}

/**
 * @param {vscode.ExtensionContext} context
 */

function activate(context) {
  console.log("running sucessfully");

  let disposable = vscode.commands.registerCommand(
    "code-formatter.convertToPascalCase",
    async function () {
      const workspaceFolders = vscode.workspace.workspaceFolders;

      if (!workspaceFolders || workspaceFolders.length === 0) {
        const openFolder = "Open Folder";
        const choice = await vscode.window.showErrorMessage(
          "No workspace folder opened. Please open a workspace folder.",
          openFolder
        );

        if (choice === openFolder) {
          vscode.commands.executeCommand("vscode.openFolder");
        }

        return;
      }

      const rootPath = workspaceFolders[0].uri.fsPath+"/src";

      const userConfirmed = await vscode.window.showInformationMessage(
        "This operation will convert file and folder names to PascalCase. Are you sure you want to proceed?",
        "Yes",
        "No"
      );

      if (userConfirmed !== "Yes") {
        return;
      }
      crispCode(rootPath);


      vscode.window.showInformationMessage(
        "Files and folders converted to PascalCase successfully."
      );
    }
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
