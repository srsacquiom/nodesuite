var core = (function() {

	var public = module.parent.iosuite,
		private = {};

	private._return = 'success';

	private._response;

	private._requestFile = '';
	private._cacheFile = '';
	private._cacheFileFull = '';

	public.init = function( file, parameters, response ) {

		private._response = response;

		if( file.indexOf('assets/') >= 0 ) {
			/*
			 * Request is for an image / script / style
			 */
			private._return = private._readAsset( file );
		} else {
			private._return = private._readFile( file );
		}

		return private._return;

	}

	private._readAsset = function( file ) {
		private._requestFile = './' + file.substr(0, file.lastIndexOf('.'));
		private._requestFileExt = '.' + file.split('.').pop();

		try {
			var asset = public.module.fs.readFileSync( private._requestFile + private._requestFileExt );

			var contentType = public.module.mime.lookup( private._requestFile + private._requestFileExt );
			private._response.writeHead( 200, { 'Content-Type': contentType } );
			private._response.end( asset, 'binary' );

		} catch(e) {
			if( e.code !== 'ENOENT' ) {
				throw e;
			} else {
				private._writeResponse( 404, 'File does not exist', { 'Content-Type': 'text/plain', 'charset': 'utf-8' });
			}
		}

	}

	private._readFile = function( file ) {

		var cacheHash = public.module.crypto.createHash('md5'),
			filePieces = file.split('/'),
			requestFolder = './';

		if( file.indexOf('.') >= 0 ) {
			private._requestFile = requestFolder + file.substr(0, file.lastIndexOf('.'));
			private._requestFileExt = '.' + file.split('.').pop();
		} else {
			private._requestFile = requestFolder + public.setting('application','directory') + '/' + file;
			private._requestFileExt = '.js';
		}

		console.log( private._requestFile );

		/*
		 * Generate MD5 hash cache name
		 */
		cacheHash.update( private._requestFile );
		private._cacheFile = cacheHash.digest('hex');
		private._cacheFileFull = './' + public.setting('application','directory') + '/cache/' + private._cacheFile + private._requestFileExt;

		switch( public.setting('application','environment') ) {
			case 'development':
				/*
				 * If the app is in development, create a cache file and send
				 */
				console.log( private._requestFile + private._requestFileExt );
				public.module.fs.readFile( private._requestFile + private._requestFileExt, 'utf8', private._createCacheFile );
				break;
			case 'production':
			case 'staging':
				/*
				 * If the app is in any other environment, read the cache if it exists otherwise create the file
				 * Note: The cache files shouldn't be saved to the repo, they will be created at first use
				 */
				public.module.fs.readFile( private._cacheFileFull, 'utf8', private._outputCacheFile );
				break;
		}

	}

	private._outputCacheFile = function( error, data ) {

		if( error === null ) {
			private._writeResponse( 200, data, { 'Content-Type': 'text/plain', 'charset': 'utf-8' });
		} else {
			public.module.fs.readFile( private._requestFile + private._requestFileExt, 'utf8', private._createCacheFile );
		}

	}

	private._createCacheFile = function( err, data ) {

		if( err == null ) {

			var lines, count,
				matches = data.match(/{{(.*)}}/g),
				tag = '',
				md5sum, newFile;

			for( var match in matches ) {

				var tag = matches[ match ].replace('{{','').replace('}}','').split(':'),
					call = '_setup' + tag[0].charAt(0).toUpperCase() + tag[0].slice(1);

				if( typeof private[ call ] == 'function' ) {
					data = private[ call ]( data, matches[ match ], tag[1] );
				}

			}

			data = data.replace(/[^'":]\/\/.*/g, function(match){
				return '/*' + match.replace('//','') + '*/';
			});

			newFile = public.setting('application','root') + public.setting('application','directory') + '/cache/' + private._cacheFile + private._requestFileExt;

			public.module.fs.writeFileSync( newFile, data );
			

			/*
			 * Run the file through the jshinter and show errors if needed
			 */
			if( public.setting('application','environment') == 'development' ) {
				//console.log( 'jshint --show-non-errors --reporter=' + public.setting('general','server_directory') + 'server/jshint_reporter.js ' + newFile );
				public.module.child_process.exec( 'jshint --show-non-errors --reporter=' + public.setting('application','root') + '/server/jshint_reporter.js' + newFile, function(error, stdout, stderr) {
					if( stdout.toString() == '' ) {
						console.log( error );
						//private._writeResponse( 200, stderr.toString(), { 'Content-Type': 'text/plain', 'charset': 'utf-8' });
						public.module.fs.readFile( private._cacheFileFull, 'utf8', private._outputCacheFile );
					} else {
						private._writeResponse( 200, stdout, { 'Content-Type': 'text/plain', 'charset': 'utf-8' });
					}

				});
			}

		} else {
			var fourohfour = './server/404.js';
			public.module.fs.readFile( fourohfour, 'utf8', function( error, data ){
				if( error === null ) {
					private._writeResponse( 200, data, { 'Content-Type': 'text/plain', 'charset': 'utf-8' });
				} else {
					private._writeResponse( 404, error.toString() );
				}
			} );

		}

	};

	private._writeResponse = function( code, output, headers ) {

		if( headers == null ) {
			private._response.writeHead( code );
		} else {
			private._response.writeHead( code, headers );
		}
		private._response.write( output );
		private._response.end();
	}

	/*
	 * Convert template call to NetSuite getBody
	 */
	private._setupTemplate = function( data, match, file ) {

		var templateUrl = public.setting('server','url') + public.setting('application','assets') + '/templates/' + file + '.html',
			templateScript = 'nlapiRequestURL("' + templateUrl + '").getBody()';

		return data.replace( match, templateScript );

	};

	private._setupStyle = function( data, match, file ) {

		var styleUrl = public.setting('server','url') + public.setting('application','assets') + '/styles/' + file + '.css',
			styleHref = 'nlapiRequestURL("' + styleUrl + '").getBody()';

		return data.replace( match, styleHref );

	};

	private._setupClient = function( data, match, file ) {

		var scriptUrl = public.setting('server','url') + '/scripts/' + file + '.js',
			scriptSrc = 'nlapiRequestURL("' + scriptUrl + '").getBody()';

		return data.replace( match, scriptSrc );

	};

	private._setupLibrary = function( data, match, file ) {

		var scriptUrl = './' + public.setting('application','directory') + '/libraries/' + file + '.js',
			library = public.module.fs.readFileSync(scriptUrl);

		return data.replace( match, library );
	}

	return public;
})();

module.exports = core;