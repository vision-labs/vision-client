// Vision Client
// Description: Client companion for Vision Admin platform
// ==

// Usage
// ==
// node index.js -t <device_token>
// node index.js -u <user_token> -o <organization_token> -n <name> -d <device_type>

var cli_server = 'http://visionadministrator.com:3001'

var si = require('systeminformation');

const shellExec = require('shell-exec')

var fs = require('fs');

var os = require('os');

var ip = require('ip');

var nmap = require('node-nmap');

var commandExists = require('command-exists');

var execa = require('execa');

var home_directory = os.homedir() + '/';

var cli_token = "";

var user_token = "";

var org_token = "";

var name = "";

var type = "";

var scan;

var command;

var d1;

var d2;

var client_version;

var package_info = require('./package.json');

process.argv.forEach(function(arg, index) {

  switch(arg) {

    case '-t':

        if(process.argv[index+1]) {

          cli_token = process.argv[index+1];
        };

        break;

    case '-s':

        if(process.argv[index+1]) {

          cli_server = process.argv[index+1];
        };

        break;

    case '-u':

        if(process.argv[index+1]) {

          user_token = process.argv[index+1];
        };

        break;

    case '-o':

        if(process.argv[index+1]) {

          org_token = process.argv[index+1];
        };

        break;

    case '-n':

        if(process.argv[index+1]) {

          name = process.argv[index+1];
        };

        break;

    case '-d':

        if(process.argv[index+1]) {

          type = process.argv[index+1];
        };

        break;
    };
});

var exports = module.exports = {};

exports.socket = null;

exports.connect = function(server, token) {

  exports.is_admin = false;

  if(parseInt(process.env.SUDO_UID)) {

    exports.is_admin = true;
  }
  else if(process.platform !== 'win32'){

    try {

      commandExists('fsutil').then(function (command) {

        execa.shell('fsutil dirty query %systemdrive%');

        exports.is_admin = true;

      }).catch(function(){
        // do nothing
      });
    }
    catch (e) {
      // do nothing
    }
  }

  console.log('running as root/admin? ' + exports.is_admin);

  exports.socket = require('socket.io-client')(server);

  exports.socket.on('connect', function(){

    console.log("connected");

    if(token.user_token && token.org_token && token.name && token.type){

      exports.socket.emit('add_device', token);
    }
    else {

      token.package_version = package_info.version;

      exports.socket.emit('room', token);

      exports.socket.emit('get_systeminfo_interval', token);
    }
  });

  exports.socket.on('set_token', function(device_token){

    console.log("set_token: " + device_token);

    exports.socket.emit('get_systeminfo_interval', device_token);
  });

  exports.socket.on('room_request_init', function(room){

    var full_room_id = room['room'] + room['session_id'];

    console.log("room_request_init: " + full_room_id);

    exports.socket.emit('room', full_room_id);

    exports.socket.emit('room_joined_ack', full_room_id);
  });

  exports.socket.on('disconnect', function(){});

  exports.socket.on('execute_command', function(data){

    console.log('execute_command: ' + data);

    if (data) {

      //string_array = data.split(" ");

      //console.log (string_array)

      //command = spawn (string_array[0], string_array.slice(1), {cwd: '/'});
      //command = spawn (string_array[0], string_array.slice(1));

      var command = JSON.parse(data);

      shellExec(command.command, {cwd: command.path}).then(function(output){

        exports.socket.emit('command_output', output);

      }).catch(function(output){
        // error handler - we havn't been able to triggor this handler
      });

      // command.on('error', function(error) {
      //
      //   exports.socket.emit('command_output', error);
      // });
      //
      // command.stdout.on('data', function (stdout_data) {
      //
      //   var stdout = stdout_data.toString()
      //
      //   console.log(stdout)
      //
      //   exports.socket.emit('command_output', stdout);
      // });

      // command.stderr.on('data', function (stderr_data) {
      //
      //   stderr = stderr_data.toString()
      //
      //   console.log(stderr)
      //
      //   exports.socket.emit('command_output', stderr);
      // });
    }
  });

  exports.socket.on('execute_action', function(data){

    console.log('execute_action: ' + data);

    // TODO: valid json check

    var action = JSON.parse(data)

    if(action.action == 'nmap') {

      commandExists('nmap').then(function (command) {

        // if(scan) {
        //
        //   scan.cancelScan();
        // }

        if(exports.is_admin){

          scan = new nmap.OsAndPortScan(action.data);
        }
        else {

          scan = new nmap.NmapScan(action.data);
        }

        scan.on('complete', function(data){

          exports.socket.emit('action_output', JSON.stringify({action: 'nmap', data: data}));
        });

        scan.on('error', function(error){

          console.log(error);

          exports.socket.emit('action_output', JSON.stringify({action: 'nmap', data: data, error: error}));
        });

        scan.startScan();

      }).catch(function () {

        console.log('action: could not find nmap installation')

        exports.socket.emit('action_output', JSON.stringify({action: 'nmap', data: null, error: 'NMAP installation could not be found on this device'}));
      });
    }
    else if(action.action == 'killprocess') {

      try {

        process.kill(action.data.pid);

        exports.socket.emit('action_output', JSON.stringify({action: 'killprocess', data: data}));
      }
      catch(error) {

        exports.socket.emit('action_output', JSON.stringify({action: 'killprocess', data: data, error: error}));
      }
    }
    else if(action.action == 'stop-nmap') {

      if(scan) {

        scan.cancelScan();
      }

      exports.socket.emit('action_output', {action: 'stop-nmap', data: data});
    }
    else if(action.action == 'command') {

      if (data) {

        var command = JSON.parse(data);

        shellExec(command.data.command, {cwd: command.data.path}).then(function(output){

          var max_length = 64535;

          var truncate = false;

          if (output.stdout.length > max_length) {

            truncate = true;

            output.stdout = output.stdout.substring(0, max_length - 1);
          }

          if (output.stderr.length > max_length) {

            truncate = true;

            output.stderr = output.stderr.substring(0, max_length - 1);
          }

          exports.socket.emit('action_output', JSON.stringify({action: 'command', data: output, truncate: truncate}));

        }).catch(function(output){
          // error handler - we havn't been able to triggor this handler
        });
      };
    }
    else if(action.action == 'view_file') {

      var file = JSON.parse(data);

      isDirectory = fs.statSync(file.data).isDirectory()

      if (!isDirectory) {

        try {

          var fileContents = fs.readFileSync(file.data);

          var base64EncodedContent = new Buffer(fileContents).toString('base64');

          // TODO: limit based on file size at some point

          exports.socket.emit('action_output', JSON.stringify({action: 'command', data: base64EncodedContent}));

        catch(error) {

          exports.socket.emit('action_output', JSON.stringify({action: 'command', data: data, error: error}));
        }
      };
    }
    else if(action.action == 'delete_file') {

      var file = JSON.parse(data);

      isDirectory = fs.statSync(file.data).isDirectory()

      if (!isDirectory) {

        // TODO: limit based on file size at some point

        fs.unlink(file.data, function (err) {
          if (err){

            exports.socket.emit('action_output', JSON.stringify({action: 'delete_file', data: err}));
          }
          else {

            exports.socket.emit('action_output', JSON.stringify({action: 'delete_file', data: true}));
          };
        });
      }
      else {

        exports.socket.emit('action_output', JSON.stringify({action: 'delete_file', data: true}));
      };
    }
    else if(action.action == 'download_file') {

      var file = JSON.parse(data);

      isDirectory = fs.statSync(file.data).isDirectory()

      if (!isDirectory) {

        var fileContents = fs.readFileSync(file.data);

        var base64EncodedContent = new Buffer(fileContents).toString('base64');

        // TODO: limit based on file size at some point

        exports.socket.emit('action_output', JSON.stringify({action: 'command', data: base64EncodedContent}));
      };
    }
    else if(action.action == 'directory') {

      var dir_output = {};

      var dir = JSON.parse(data).data;

        fs.readdir(dir, function(err, files) {

            dir_output.directory = dir;

            dir_output.files = [];

            for (var file in files) {

              try {

                var stats = fs.statSync(dir + files[file])

                dir_output.files.push({
                  name: files[file],
                  directory: stats.isDirectory(),
                  size: stats.size,
                  create_date: parseInt(stats['ctimeMs']),
                  modified_date: parseInt(stats['mtimeMs'])
                })

              }
			  catch(e) {
                dir_output.files.push({
                  name: files[file],
                  error: e
                })
              }
            }

            exports.socket.emit('action_output', JSON.stringify({action: 'directory', data: dir_output}));
        });
    }
    else if(action.action == 'download') {

      file_info = JSON.parse(data).data;

      file_path = file_info.path + file_info.file

      isDirectory = fs.statSync(file_path).isDirectory()

      if (!isDirectory) {

        var fileContents = fs.readFileSync(file_path);

        var binaryContent = new Buffer(fileContents).toString('base64');

        // TODO: limit based on file size at some point

        exports.socket.emit('action_output', JSON.stringify({action: 'download', data: binaryContent}));
      };
    }
    else if(action.action == 'upload_file') {

      file_info = JSON.parse(data);

      fs.writeFileSync(file_info.data.directory + file_info.data.file, Buffer.from(file_info.data.data.data));

      exports.socket.emit('action_output', JSON.stringify({action: 'upload_file', data: true}));
    }
    else if(action.action == 'systeminit') {

      var output = {}

      fs.readdir(home_directory, function(err, files) {

        console.log('readdir: ' + (((new Date()) - d1)/1000) + 'seconds');

        output.directory = home_directory;

        output.files = [];

        for (var file in files) {

          var stats = fs.statSync(home_directory + files[file])

          console.log(stats)

          output.files.push({
            name: files[file],
            directory: stats.isDirectory(),
            size: stats.size,
            create_date: parseInt(stats['ctimeMs']),
            modified_date: parseInt(stats['mtimeMs'])
          })
        }

        if(exports.socket){

          exports.socket.emit('action_output', JSON.stringify(output));
        };
      });
    };
  });

  exports.socket.on('get_systeminfo', function(data){

    console.log('get_systeminfo: ' + data);

    var output = {}

    d1 = new Date();

    si.mem(function(memData) {

      console.log('mem: ' + (((new Date()) - d1)/1000) + 'seconds');

      output.mem = memData;

      d1 = new Date();

      si.users(function(usersData) {

        console.log('users: ' + (((new Date()) - d1)/1000) + 'seconds');

        output.users = usersData;

        d1 = new Date();

        si.networkConnections(function(networkConnectionsData) {

          console.log('networkConnections: ' + (((new Date()) - d1)/1000) + 'seconds');

          output.networkConnections = networkConnectionsData;

          d1 = new Date();

          si.currentLoad(function(currentLoadData) {

            console.log('currentLoad: ' + (((new Date()) - d1)/1000) + 'seconds');

            output.currentLoad = currentLoadData;

            d1 = new Date();

            si.services('postgresql, mysql, apache2, nginx, sshd', function(servicesData) {

              console.log('services: ' + (((new Date()) - d1)/1000) + 'seconds');

              output.services = servicesData;

              d1 = new Date();

              si.processes(function(processesData) {

                console.log('processes: ' + (((new Date()) - d1)/1000) + 'seconds');

                output.processes = processesData;

                // Breaks if host does not have docker installed
                // ====
                //
                // d1 = new Date();
                //
                // si.dockerContainers(function(dockerContainersData) {
                //
                //   console.log('dockerContainers: ' + (((new Date()) - d1)/1000) + 'seconds');
                //
                //   output.dockerContainers = dockerContainersData;

                  d1 = new Date();

                  si.fsSize(function(fsSizeData) {

                    console.log('fsSize: ' + (((new Date()) - d1)/1000) + 'seconds');

                    output.fsSize = fsSizeData;

                    d1 = new Date();

                    fs.readdir(home_directory, function(err, files) {

                      console.log('readdir: ' + (((new Date()) - d1)/1000) + 'seconds');

                      output.directory = home_directory;

                      output.files = [];

                      for (var file in files) {

                        output.files.push({
                          name: files[file],
                          directory: fs.statSync(home_directory + files[file]).isDirectory()
                        })
                      }

                      d1 = new Date();

                      si.getStaticData(function(getStaticData) {

                        console.log('getStaticData: ' + (((new Date()) - d1)/1000) + 'seconds');

                        output.getStaticData = getStaticData;

                        d1 = new Date();

                        var network_interfaces = os.networkInterfaces();

                        Object.keys(network_interfaces).forEach(function(interface) {

                          var addresses = network_interfaces[interface];

                          if(addresses) {

                            addresses.forEach(function(address) {

                              address.networkAddress = ip.subnet(address.address, address.netmask);

                              address.subnetMaskLength = address.subnetMaskLength;

                              address.interfaceName = interface;
                            });
                          };
                        });

                        output.networkInterfaces = network_interfaces;

                        console.log('systeminfo_output: ' + data);

                        if(exports.socket){

                          exports.socket.emit('systeminfo_output', output);
                        };
                      });
                    });
                  });
                // }); // docker
              });
            });
          });
        });
      });
    });
  });

  exports.socket.on('get_directory', function(data){

    console.log('get_directory')

    var dir_output = {};

    var dir = data;

    fs.readdir(dir, function(err, files) {

        dir_output.directory = dir;

        dir_output.files = [];

        for (var file in files) {

          dir_output.files.push({
            name: files[file],
            directory: fs.statSync(dir + files[file]).isDirectory()
          })
        }

        exports.socket.emit('directory_list', dir_output);
    });
  });

  exports.socket.on('view_file', function(data){

    console.log('view_file')

    isDirectory = fs.statSync(data).isDirectory()

    if (!isDirectory) {

      var fileContents = fs.readFileSync(data);

      var base64EncodedContent = new Buffer(fileContents).toString('base64');

      // TODO: limit based on file size at some point

      exports.socket.emit('send_file', base64EncodedContent);
    };
  });

  exports.socket.on('download_file', function(file_info){

    console.log('download_file')

    file_path = file_info.path + file_info.file

    isDirectory = fs.statSync(file_path).isDirectory()

    if (!isDirectory) {

      var fileContents = fs.readFileSync(file_path);

      var binaryContent = new Buffer(fileContents).toString();

      // TODO: limit based on file size at some point

      exports.socket.emit('send_download_file', binaryContent);
    };
  });
};

exports.connect(cli_server, {cli_token: cli_token, user_token: user_token, org_token: org_token, name: name, type: type, client_version: client_version});
