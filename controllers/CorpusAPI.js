/*
The MIT License (MIT)

Copyright (c) 2013-2014 CNRS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

var async = require('async');
var commonFuncs = require('../lib/commonFuncs');
var	layerAPI = require('../controllers/LayerAPI');

//create a corpus
exports.create = function(req, res){
	var error=null;
	async.waterfall([
		function(callback) {											// check field
			if (req.body.name == undefined) error="the name is not define";
			if (req.body.name == "") 		error="empty string for name is not allow";
			callback(error);
		},		
		function(callback) {											// check if the name is not already used (name must be unique)
			Corpus.count({name: req.body.name}, function (error, count) {	
				if ((!error) && (count != 0)) error = "the corpus name is already used, choose another name";
		        callback(error);
		    });
		},
		function(callback) {											// create the group
			var new_corpus = {};
			new_corpus.name = req.body.name;
			new_corpus.description = req.body.description;
			new_corpus.history = []
			new_corpus.history.push({date:new Date(), 
									 id_user:req.session.user._id, 
									 modification:{"name":new_corpus.name, 
									 			   "description":new_corpus.description}
									});
			new_corpus.ACL = {users:{}, groups:{}};
			new_corpus.ACL.users[req.session.user._id]='O';				// set 'O' right to the user logged
			var corpus = new Corpus(new_corpus).save(function (error, newCorpus) {		// save it into the db
				if (newCorpus) res.status(200).json(newCorpus);
				callback(error);
			});			
		}
	], function (error) {
		if (error) res.status(400).json({message:error});
	});
};

// print _id, name, description and history
printResCorpus = function(corpus, res) {
	res.status(200).json({"_id":corpus._id,
			 			  "name":corpus.name,
						  "description":corpus.description,
						  "history":corpus.history
						 });
}

// for the list of corpus print _id, name, description and history
printMultiRes = function(l_corpus, res) {
	var p = [];
	for (i = 0; i < l_corpus.length; i++) { 
		p.push({"_id":l_corpus[i]._id,
				"name":l_corpus[i].name,
				"description":l_corpus[i].description,
				"history":l_corpus[i].history
		  	   })
	} 
	res.status(200).json(p);
}

// check if the id_corpus exists in the db
exports.exist = function(req, res, next) {
	Corpus.findById(req.params.id_corpus, function(error, corpus){
		if (error) res.status(400).json(error);
		else if (!corpus) res.status(400).json({message:"id_corpus don't exists"});
		else next();
	});
}

// check if req.session.user._id have the good right to see this req.params.id_corpus
exports.AllowUser = function (list_right){
	return function(req, res, next) {
		async.waterfall([
			function(callback) {										// find the user
				User.findById(req.session.user._id, function(error, user){
					callback(error, user);
				});
			},
			function(user, callback) {									// find the list of group belong the user
				Group.find({'users_list' : {$regex : new RegExp('^'+ req.session.user._id + '$', "i")}}, function(error, groups) {
					callback(error, user, groups);
				});
			},
			function(user, groups, callback) {							// find if the user have the right to access this corpus
				Corpus.findById(req.params.id_corpus, function(error, corpus){
					if (commonFuncs.checkRightACL(corpus, user, groups, list_right)) next();
					else error = "Acces denied";
					callback(error);
	    		});
			},
		], function (error, trueOrFalse) {
			if (error) res.status(400).json({message:error});
		});
	}
}

// retrieve all corpus where the user logged is 'O' or 'W' or 'R' and print _id, name, description and history
exports.getAll = function (req, res) {
	async.waterfall([
		function(callback) {											// find the user
			User.findById(req.session.user._id, function(error, user){
				callback(error, user);
			});
		},
		function(user, callback) {										// find the list of group belong the user
			Group.find({'users_list' : {$regex : new RegExp('^'+ req.session.user._id + '$', "i")}}, function(error, groups) {
				callback(error, user, groups);
			});
		},
		function(user, groups, callback) {
			Corpus.find({}, function(error, l_corpus){					// print all corpus where the user have the good right
    			async.filter(l_corpus, 
    			        	 function(corpus, callback) {
    			          		callback (commonFuncs.checkRightACL(corpus, user, groups, ['O', 'W', 'R']));
    			        	 },
    			        	 function(results) { printMultiRes(results, res); } 
    			);	
    			callback(error);		
    		});
		},
	], function (error, trueOrFalse) {
		if (error) res.status(400).json({message:error});
	});
}

// retrieve a particular corpus with his _id and print _id, name, description and history
exports.getInfo = function(req, res){
	Corpus.findById(req.params.id_corpus, '_id name description history', function(error, corpus){
		if (error) res.status(400).json({message:error});
    	else res.status(200).json(corpus);
	});
}

// update information of a corpus
exports.update = function(req, res){
	var newHistory = {};
	Corpus.findById(req.params.id_corpus, function(error, corpus){
		if (req.body.name) {											// check field
			if (req.body.name == "") res.status(400).json({message:"name can't be empty"});
			else {
				corpus.name = req.body.name;
				newHistory.name = req.body.name;
			}
		}				
		if (req.body.description) {
			corpus.description = req.body.description;
			newHistory.description = req.body.description;
		}
		corpus.history.push({date:new Date(), id_user:req.session.user._id, modification:newHistory})	// update history with the modification
		corpus.save(function(error, newCorpus) {						// save the corpus in the db
			if (error) res.status(400).json({message:error});
			else printResCorpus(newCorpus, res);
		});
	});
}

// remove a given corpus
exports.remove = function (req, res) {
	var error;
	async.waterfall([
		function(callback) {											// check if there is no layer with annotation into the corpus
			Layer.find({id_corpus:req.params.id_corpus}, function(error, layers){
				if (layers.length>0) {
					if (req.session.user.username === "root"){
						for (i = 0; i < layers.length; i++) Annotation.remove({id_layer : layers[i]._id}, function (error, annotations) {
							callback(error);
						});
					}
				}
				else callback(null);		
    		});
		},
		function(callback) {											// check if there is no layer into the media
			if (req.session.user.username === "root") {
				Layer.remove({id_corpus:req.params.id_corpus}, function (error, layers) {
					callback(error);
				});				
			}
			else {
				Layer.find({id_corpus:req.params.id_corpus}, function(error, layers){
					if (layers.medias>0) error = "corpus is not empty (one or more layers is remaining)"
					callback(error);
				});
			}
		},			
		function(callback) {											// check if there is no layer into the media
			if (req.session.user.username === "root") {
				Media.remove({id_corpus:req.params.id_corpus}, function (error, media) {
					callback(error);
				});				
			}
			else {
				Media.find({id_corpus:req.params.id_corpus}, function(error, medias){
					if (medias.length>0) error = "corpus is not empty (one or more media is remaining)";
					callback(error);
				});
			}
		},	
		function(callback) {											// remove the corpus
			Corpus.remove({_id : req.params.id_corpus}, function (error, corpus) {
				callback(error);
			});
		}
	], function (error, trueOrFalse) {
		if (error) res.status(400).json({message:error});
		else res.status(200).json({message:"The corpus as been delete"});
	});
}

// get ACL of the corpus
exports.getACL = function(req, res){
	Corpus.findById(req.params.id_corpus, 'ACL', function(error, corpus){   //
		if (error) res.status(400).json({message:error});
    	else res.status(200).json(corpus);
	});
}

// update ACL of a user
exports.updateUserACL = function(req, res){
	if (req.body.Right != 'O' && req.body.Right != 'W' && req.body.Right != 'R') res.status(400).json({message:"Right must be 'O' or 'W' or 'R'"});
	Corpus.findById(req.params.id_corpus, function(error, corpus){		// find the corpus
		var update = {ACL:corpus.ACL};		
		if (error) res.status(400).json({message:error});
		if (!update.ACL.users) update.ACL.users = {};
		update.ACL.users[req.params.id_user]=req.body.Right;			// update acl
		Corpus.findByIdAndUpdate(req.params.id_corpus, update, function (error, newCorpus) {	// save the corpus with the new ACL
			if (error) res.status(400).json({message:error});
			else res.status(200).json(newCorpus.ACL);
		});	
	});
}

// update ACL of a group
exports.updateGroupACL = function(req, res){
	if (req.body.Right != 'O' && req.body.Right != 'W' && req.body.Right != 'R') res.status(400).json({message:"Right must be 'O' or 'W' or 'R'"});
	Corpus.findById(req.params.id_corpus, function(error, corpus){		// find the corpus
		var update = {ACL:corpus.ACL};		
		if (error) res.status(400).json({message:error});
		if (!update.ACL.groups) update.ACL.groups = {};
		update.ACL.groups[req.params.id_group]=req.body.Right;			// update acl
		Corpus.findByIdAndUpdate(req.params.id_corpus, update, function (error, newCorpus) {	// save the corpus with the new ACL
			if (error) res.status(400).json({message:error});
			else res.status(200).json(newCorpus.ACL);
		});	
	});
}

// remove a user from ACL
exports.removeUserFromACL = function(req, res){	
	Corpus.findById(req.params.id_corpus, function(error, corpus){		// find the corpus
		if (error) res.status(400).json({message:error});
		var update = {ACL:corpus.ACL};	
		if (!update.ACL.users || update.ACL.users==null) res.status(400).json({message:req.params.id_user+" not in ACL.users"}); 
		else if (!update.ACL.users[req.params.id_user]) res.status(400).json({message:req.params.id_user+" not in ACL.users"}); 
		else {
			delete update.ACL.users[req.params.id_user];				// delete the user from ACL
			if (Object.getOwnPropertyNames(update.ACL.users).length === 0) update.ACL.users = undefined;
			Corpus.findByIdAndUpdate(req.params.id_corpus, update, function (error, newCorpus) {	// save the corpus with the new ACL
				if (error) res.status(400).json({message:error});
				else res.status(200).json(newCorpus.ACL);
			});	
		}				
	});
}

// remove a group from ACL
exports.removeGroupFromACL = function(req, res){
	Corpus.findById(req.params.id_corpus, function(error, corpus){		// find the corpus
		if (error) res.status(400).json({message:error});
		var update = {ACL:corpus.ACL};	
		if (!update.ACL.groups || update.ACL.groups==null) res.status(400).json({message:req.params.id_group+" not in ACL.groups"}); 
		else if (!update.ACL.groups[req.params.id_group]) res.status(400).json({message:req.params.id_group+" not in ACL.groups"}); 
		else {
			delete update.ACL.groups[req.params.id_group];				// delete the group from ACL
			if (Object.getOwnPropertyNames(update.ACL.groups).length === 0) update.ACL.groups = undefined;
			Corpus.findByIdAndUpdate(req.params.id_corpus, update, function (error, newCorpus) {	// save the corpus with the new ACL
				if (error) res.status(400).json({message:error});
				else res.status(200).json(newCorpus.ACL);
			});	
		}				
	});
}

//add a media
exports.addMedia = function(req, res){
	var error=null;
	async.waterfall([
		function(callback) {											// check field
			if (req.body.name == undefined) error="the name is not define";
			if (req.body.name == "") 		error="empty string for name is not allow";
			callback(error);
		},		
		function(callback) {											// check if the name is not already used (name must be unique)
			Media.count({name: req.body.name, id_corpus: req.params.id_corpus}, function (error, count) {	
				if ((!error) && (count != 0)) error = "the media name is already used, choose another name";
		        callback(error);
		    });
		},
		function(callback) {											// create the new media
			var new_media = {};
			new_media.name = req.body.name;
			new_media.description = req.body.description;
			new_media.url = req.body.url;
			new_media.id_corpus = req.params.id_corpus;
			new_media.history = []
			new_media.history.push({date:new Date(), 
									id_user:req.session.user._id, 
									modification:{"name":new_media.name, 
												  "description":new_media.description, 
												  "url":new_media.url}
								   });
			var media = new Media(new_media).save(function (error, newMedia) {	// save the new media
				if (newMedia) res.status(200).json(newMedia);
				callback(error);
			});			
		}
	], function (error) {
		if (error) res.status(400).json({message:error});
	});
};

//add a medias
exports.addMedias = function(req, res){
	var error=null;
	async.waterfall([
		function(callback) {											// check field
			if (req.body.media_list == undefined) callback("the list of media is not define");
			if (req.body.media_list.length == 0)  callback("the list of media is empty");
			if (req.body.media_list) {
				for (var i = 0; i < req.body.media_list.length; i++) { 
					if (req.body.media_list[i].name == undefined) callback("One media name is not define");
					if (req.body.media_list[i].name == "") 		  callback("One media name is empty (not allowed for media name)");
				}
			}
			callback(null);
		},		
        function(callback) {
			var l_media_name = [];
			for (var i = 0; i < req.body.media_list.length; i++) l_media_name.push(req.body.media_list[i].name) ;
			async.map(l_media_name, 
					  function(media_name, callback) {
							Media.count({name: media_name, id_corpus: req.params.id_corpus}, function (error, count) {
								if (count != 0) callback("the name '"+media_name+"' is already used in this corpus, choose another name");
								else callback(error);
						    });
					  }, 
					  function(error) {callback(error); }
			);
        },
		function(callback) {											// create the new medias
			var l_medias = []
			async.map(req.body.media_list, function(media, callback) {
			  		var new_media = {};
					new_media.name = media.name;
					new_media.description = media.description;
					new_media.url = media.url;
					new_media.id_corpus = req.params.id_corpus;
					new_media.history = []
					new_media.history.push({date:new Date(), 
											id_user:req.session.user._id, 
											modification:{"name":new_media.name, 
														  "description":new_media.description, 
														  "url":new_media.url}
										   });
					var c_media = new Media(new_media).save(function (error, newMedia) {	// save the new media
						l_medias.push(newMedia)
						callback(error);
					});
				}, function(error) {
					callback(error, l_medias); 
				}
			);
		}
	], function (error, l_medias) {
		if (error) res.status(400).json({message:error});
		else res.status(200).json(l_medias);
	});
};

function find_id_media(media_name, callback) {
	Media.findOne({"name":media_name}, function(error, media){
		if (media) callback(error, media._id);
		else callback("media '"+media_name+"' not found in the db", undefined);
	});
};

//create a layer
exports.addLayer = function(req, res){
	async.waterfall([
		function(callback) {											// check field
			if (req.body.name == undefined) 			callback("the name is not define");
			if (req.body.name == "") 					callback("empty string for name is not allow");
			if (req.body.fragment_type == undefined) 	callback("the fragment_type is not define");
			if (req.body.data_type == undefined) 		callback("the data_type is not define");
			if (req.body.annotations) {
				for (var i = 0; i < req.body.annotations.length; i++) { 
					if (!req.body.annotations[i].data) 		  callback("data is not define for an annotation");
					if (!req.body.annotations[i].fragment) 	  callback("fragment is not define for an annotation");
					if (!req.body.annotations[i].media_name && !req.body.annotations[i].id_media )  callback("media_name or id_media is not define for an annotation");
				}
			}
			callback(null);
		},		
		function(callback) {											// check if the name is not already used (name must be unique)
			Layer.count({name: req.body.name, id_corpus: req.params.id_corpus}, function (error, count) {	
				if ((!error) && (count != 0)) error = "the layer name is already used, choose another name";
		        callback(error);
		    });
		},
        function(callback) {
			if (req.body.annotations) {
				var media_id_name = {};
				for (var i = 0; i < req.body.annotations.length; i++) {
					if (req.body.annotations[i].media_name) media_id_name[req.body.annotations[i].media_name] = '';
				}
				var l_media = Object.keys(media_id_name);
				async.map(l_media, find_id_media, function(error, id_media) {
						for (var i = 0; i < l_media.length; i++) media_id_name[l_media[i]] = id_media[i];
			            callback(error, media_id_name);
				    }
				);
	        }
	        else callback(null, {})
        },
		function(media_id_name, callback) {											// create the new layer
			var new_layer = {};
			new_layer.name = req.body.name;
			new_layer.description = req.body.description;
			new_layer.id_corpus = req.params.id_corpus;
			new_layer.fragment_type = req.params.id_fragment_typecorpus;
			new_layer.data_type = req.params.data_type;
			new_layer.history = [];
			new_layer.history.push({date:new Date(), 
									id_user:req.session.user._id, 
									modification:{"name":new_layer.name, 
												  "description":new_layer.description,
												  "fragment_type":new_layer.fragment_type,
												  "data_type":new_layer.data_type}
									});
			new_layer.ACL = {users:{}, groups:{}};
			new_layer.ACL.users[req.session.user._id]='O';				// set 'O' right to the user logged
			var layer = new Layer(new_layer).save(function (error, newLayer) {	// save the new layer
				if (newLayer) res.status(200).json(newLayer);
				callback(error, media_id_name, newLayer);
			});			
		},
		function(media_id_name, newLayer, callback) {
			if (req.body.annotations) {
				for (i = 0; i < req.body.annotations.length; i++) { 
					var new_annotation = {};
					new_annotation.fragment = req.body.annotations[i].fragment;
					new_annotation.data 	= req.body.annotations[i].data;
					new_annotation.id_layer = newLayer._id;
					if (req.body.annotations[i].media_name) new_annotation.id_media = media_id_name[req.body.annotations[i].media_name];
					else new_annotation.id_media = req.body.annotations[i].id_media;
					new_annotation.history 	= [];
					new_annotation.history.push({date:new Date(), 
												 id_user:req.session.user._id, 
												 modification:{"fragment":new_annotation.fragment, 
												 			   "data":new_annotation.data
												 			  }
												 });
					var annotation = new Annotation(new_annotation).save(function (error, newAnnotation) {
						if (error) callback(error);
					});
				}
				callback(null);
			}
			else callback(null);

		}

	], function (error) {
		if (error) res.status(400).json({message:error});
	});
};

// retrieve all media of a corpus and where the user logged is 'O' or 'W' or 'R' on the corresponding corpus 
// and print _id, name, id_corpus, description, url and history
exports.getAllMedia = function(req, res){
	Media.find({}, function(error, medias){								// fin all media
		async.filter(medias, 											// filter the list with media belong to the corpus
		        	 function(media, callback) { 
		        	 	if (media.id_corpus == req.params.id_corpus) callback(true);
		        	 	else callback(false);
		        	 },
		        	 function(results) { res.status(200).json(results); } 
		);	
	});
}

// retrieve all layer of a corpus and where the user logged is 'O' or 'W' or 'R' for layer 
// and print _id, name, description, id_corpus, fragment_type, data_type, history
exports.getAllLayer = function (req, res) {
	async.waterfall([
		function(callback) {
			User.findById(req.session.user._id, function(error, user){	// find the user logged
				callback(error, user);
			});
		},
		function(user, callback) {										// find the group belong to the user logged
			Group.find({'users_list' : {$regex : new RegExp('^'+ req.session.user._id + '$', "i")}}, function(error, groups) {
				callback(error, user, groups);
			});
		},
		function(user, groups, callback) {								// find all layer
			Layer.find({}, function(error, layers){
    			async.filter(layers, 									// filter the list with layer belong the corpus and where the user have the good right
    			        	 function(layer, callback) {
		        	 			if (layer.id_corpus == req.params.id_corpus && commonFuncs.checkRightACL(layer, user, groups, ['O', 'W', 'R'])) callback(true);
		        	 			else callback(false);    			        	 	
    			        	 },
    			        	 function(results) { layerAPI.printMultiRes(results, res); } 
    			);	
    			callback(error);		
    		});
		},
	], function (error, trueOrFalse) {
		if (error) res.status(400).json({message:error});
	});
}
