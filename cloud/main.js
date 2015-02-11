var app = require("cloud/app.js");

var moment = require('moment');
var _ = require('underscore');
var todo_status = app.todo_status;
var processing_status = app.processing_status;
var done_status = app.done_status;
var mlog = require('cloud/mlog.js');

AV.Cloud.beforeSave('Ticket', function (req, res) {
  console.log(req.object);
  res.success();
});

AV.Cloud.define("ClearProcessing_timer", function (req, res) {
  console.log("Clear precessing list.");
  var query = new AV.Query("Ticket");
  query.equalTo('status', processing_status);
  query.limit(1000);
  query.descending("createdAt");
  var clearN = 0;
  var info = '';
  query.find().then(function (tickets) {
    tickets = tickets || [];
    var outPromises = [];
    _.each(tickets, function (t) {
      var querythread = new AV.Query("Thread");
      querythread.descending("createdAt");
      querythread.limit(1);
      querythread.equalTo("ticket", AV.Object.createWithoutData("Ticket", t.id));
      var outPromise = querythread.find().then(function (threads) {
        threads = threads || [];
        var th;
        if (threads.length > 0) {
          th = threads[0];
          var lastday = moment(new Date()).diff(moment(th.createdAt), 'days');
          info += lastday + '  ';
          if (lastday >= 8) {
            t.set('status', done_status);
            clearN++;
            console.log('Clear Ticket ' + t.id + ' title=' + t.get('title'));
            app.sendCloseEmail(t);
            return t.save();
          }
        }
        return AV.Promise.as();
      });
      outPromises.push(outPromise);
    }, res.error);
    return AV.Promise.when(outPromises);
  }, res.error).then(function () {
    var msg = clearN + ' tickets are cleared !';
    console.log(msg);
    res.success(msg);
  });
});

AV.Cloud.define("NotifyReply", function (req, res) {
  mlog.log('NotifyReply');
  var q = new AV.Query("Ticket");
  q.equalTo('status', todo_status);
  q.ascending("updatedAt");
  q.find().then(function (tickets) {
    var p = AV.Promise.as(false);
    mlog.log(tickets.length);
    for (var i = 0; i < tickets.length; i++) {
      mlog.log('index='+i);
      var t = tickets[i];
      p = p.then(function (res) {
        if(res){
          return AV.Promise.as(true);
        }
        var promise = new AV.Promise();
        var tQ = new AV.Query('Thread');
        tQ.equalTo('ticket', t);
        tQ.descending('createdAt');
        tQ.first().then(function (th) { // th is undefined when the ticket is created just now
          if (!th || th.get('notify') != true) {
            var last,c;
            if(th){
              last=th.createdAt;
              c=th.get('content');
            }else{
              last= t.createdAt;
              c= t.get('content');
            }
            var date = new Date().toLocaleString();
            var time = moment(date).diff(last);
            var tTime = app.transfromTime(time);
            app.notifyTicketToChat(t, c, '用户已经等待了' + tTime + '！');
            console.log('Notify hipchat ' + tTime);
            if(th){
              th.set('notify', true);
              mlog.log('set time to' + date);
              th.save().then(function () {
                promise.resolve(true);
              });
            }else{
              promise.resolve(true);
            }
          } else {
            promise.resolve(false);
          }
        });
        return promise;
      });
    }
    p.then(function(){
      res.success('ok');
    });
  });
});

AV.Cloud.onVerified('email',function(){
});
// 对Date的扩展，将 Date 转化为指定格式的String 
// 月(M)、日(d)、小时(h)、分(m)、秒(s)、季度(q) 可以用 1-2 个占位符， 
// 年(y)可以用 1-4 个占位符，毫秒(S)只能用 1 个占位符(是 1-3 位的数字) 
// 例子： 
// (new Date()).Format("yyyy-MM-dd hh:mm:ss.S") ==> 2006-07-02 08:09:04.423 
// (new Date()).Format("yyyy-M-d h:m:s.S")      ==> 2006-7-2 8:9:4.18 
Date.prototype.Format = function(fmt) 
{ //author: meizz 
  var o = { 
    "M+" : this.getMonth()+1,                 //月份 
    "d+" : this.getDate(),                    //日 
    "h+" : this.getHours(),                   //小时 
    "m+" : this.getMinutes(),                 //分 
    "s+" : this.getSeconds(),                 //秒 
    "q+" : Math.floor((this.getMonth()+3)/3), //季度 
    "S"  : this.getMilliseconds()             //毫秒 
  }; 
  if(/(y+)/.test(fmt)) 
    fmt=fmt.replace(RegExp.$1, (this.getFullYear()+"").substr(4 - RegExp.$1.length)); 
  for(var k in o) 
    if(new RegExp("("+ k +")").test(fmt)) 
  fmt = fmt.replace(RegExp.$1, (RegExp.$1.length==1) ? (o[k]) : (("00"+ o[k]).substr((""+ o[k]).length))); 
  return fmt; 
}

function arrayToString(array,split){
    var _array = array;
    var _str = "";
    for (var i = 0; i < _array.length; i++) {
        if(i === _array.length-1){
            _str += _array[i]
        }else{
            _str += _array[i] + split
        }
    }
    return _str;
}

function jsDateDiff(publishTime){       
    var d_minutes,d_hours,d_days;       
    var timeNow = parseInt(new Date().getTime()/1000);       
    var d;       
    var pt = parseInt(new Date(publishTime).getTime()/1000); 
    d = timeNow - pt;       
    d_days = parseInt(d/86400);       
    d_hours = parseInt(d/3600);       
    d_minutes = parseInt(d/60);       
    if(d_days>0 && d_days<4){       
        return d_days+"天前";       
    }else if(d_days<=0 && d_hours>0){       
        return d_hours+"小时前";       
    }else if(d_hours<=0 && d_minutes>0){       
        return d_minutes+"分钟前";       
    }else if(d_minutes<=0){       
        return "刚刚";       
    }else{       
        var s = new Date(publishTime);       
        // s.getFullYear()+"年";
        return (s.getMonth()+1)+"月"+s.getDate()+"日";       
    }       
}    

function usercode(){
	var Num=""; 
	for(var i=0;i<6;i++) 
	{ 
		Num+=Math.floor(Math.random()*10); 
	} 
	return Num;
}

AV.Cloud.define("hello", function(request, response) {
	var uc = usercode();
  	response.success(uc);
});
AV.Cloud.afterSave("loginLog", function(request) {
  query = new AV.Query("devices");
  query.equalTo('deviceId', request.object.get("deviceId"));
  query.find({
    success: function(results) {
    	//console.log(JSON.stringify(request));
      	if(results.length<=0){
      		var devices = AV.Object.extend("devices");
      		var device = new devices();	
		 	device.set("deviceId", request.object.get("deviceId"));
			device.set("deviceModel", request.object.get("deviceModel"));
			device.set("deviceName", request.object.get("deviceName"));  
			var _addr = request.object.get("city") + request.object.get("district") + request.object.get("street");
			device.set("address", _addr);
			device.set("point", request.object.get("point"));
			device.save(null, {
			  success: function(info) {
		 		//console.log(JSON.stringify(info));
			  },
			  error: function(info, error) {
				console.log(JSON.stringify(error));
			  }
			});  
      	}
	},
    error: function(error) {
    	console.log(JSON.stringify(error));
    }
  });
});
AV.Cloud.define("loginLog", function(request, response) {
	var _user,_devId,_devModel,_devName,_city,_dist,_street,_lat,_lon;
	
	("user" in request.params) ? _user = request.params.user : _user = "";
	("deviceId" in request.params) ? _devId = request.params.deviceId : _devId = "";
	("deviceModel" in request.params) ? _devModel = request.params.deviceModel : _devModel = "";
	("deviceName" in request.params) ? _devName = request.params.deviceName : _devName = "";
	("city" in request.params) ? _city = request.params.city : _city = "";
	("district" in request.params) ? _dist = request.params.district : _dist = "";
	("street" in request.params) ? _street = request.params.street : _street = "";
	("latitude" in request.params) ? _lat = request.params.latitude : _lat = "";
	("longitude" in request.params) ? _lon = request.params.longitude : _lon = "";

	var loginLog = AV.Object.extend("loginLog");
	var ll = new loginLog();	

	if(_user){
		var user =  AV.Object.createWithoutData("_User", _user);
		ll.set("userId", user);		
	}
	
	var userPoint;
	if(_lat && _lon){
		userPoint = new AV.GeoPoint({latitude: _lat, longitude: _lon});
		ll.set("point", userPoint);
	}
	ll.set("deviceId", _devId);
	ll.set("deviceModel", _devModel);
	ll.set("deviceName", _devName);
	ll.set("city", _city);
	ll.set("district", _dist);
	ll.set("street", _street);
	ll.save(null, {
	  success: function(info) {
 		//console.log(JSON.stringify(info));
	  },
	  error: function(info, error) {
		//console.log(JSON.stringify(error));
	  }
	});  	
});

AV.Cloud.define('forgotPassword', function(request, response) {
	var phone = request.params.phone;
	var pwd = request.params.pwd;
	
	var query = new AV.Query(AV.User);
	query.equalTo('username', phone);  // find all the women
	query.equalTo('mobilePhoneNumber', phone); 
	query.find({
	  success: function(userinfo) {
	    if(userinfo.length>0){
			var user = new AV.User()
			user = userinfo[0];
			user._isCurrentUser= true;
			AV.User._currentUser = user;
			user.set("password", pwd);
			user.save(null, {
	  			success: function(user) {
	  				response.success("密码设置成功，请牢记您的密码！");
	  			},
	  			error: function(user, error) {
	  			    response.error("密码修改失败(" + error.code + ")");
	            }
	  		});
	    }else{
	        response.error('“'+phone + '”此手机号未注册！');
	    }
	  }
	});	
});

AV.Cloud.define('userAddressAdd', function(request, response) {
	var _user,_name,_phone,_address;
	("user" in request.params) ? _user = request.params.user : _user = "";
	("name" in request.params) ? _name = Number(request.params.name) : _name = "";
	("phoneNumber" in request.params) ? _phone = request.params.phoneNumber : _phone = "";
	("address" in request.params) ? _address = request.params.address : _address = "";

	if(_user && _address){
		var user =  AV.Object.createWithoutData("_User", _user);
		user.fetch({
			success: function(ret) {
				var userAddress = AV.Object.extend("userAddress");
				var address = new userAddress();
				address.set("user", user);
				address.set("name", _name);
				address.set("phoneNumber", _phone);
				address.set("address", _address);
				address.save(null, {
				  	success: function(addr) {
						var obj = addr;
				  		var it = {
					  		id : obj.id,
					  		name : obj.get("name") || "",
					  		phoneNumber : obj.get("phoneNumber") || "",
					  		address: obj.get("address") || ""
				  		}
						response.success({address:it,message:"地址添加成功！"});
				  	},
				  	error: function(error) {
						response.error(error);
				  	}
				});
			},
			error: function(error) {
				response.error("用户不存在！");
			}
		});		
	}else{
		response.success("错误用户！");
	}
});

AV.Cloud.define('initUpdate', function(request, response) {
	var cu= AV.Object.extend("classUpdate");
	var query = new AV.Query(cu);
	query.find({
	    success: function(results) {
	        var res = [];
	        for(var i = 0; i<results.length; i++){
				var obj = results[i];
				var arr = {
				    title : obj.get("class"),
				    time: obj.get("update"),
				    value: obj.get("data")
				}
				res.push(arr);
	        }
	        response.success(res);
	    }
	});
});

AV.Cloud.define('searchMer', function(request, response) {
	var _val,_lat,_lng,_pIndex;
	("value" in request.params) ? _val = request.params.value : _val = "郑瑾茜";
	("latitude" in request.params) ? _lat = Number(request.params.latitude) : _lat = 30.927815;
	("longitude" in request.params) ? _lng = Number(request.params.longitude) : _lng = 113.931961;
	("pageIndex" in request.params) ? _pIndex = Number(request.params.pageIndex) : _pIndex = 0;
	
	var limit = 20;
	
	var userPoint = new AV.GeoPoint({latitude: _lat, longitude: _lng});
	
	var queryTitle = new AV.Query("merchants");
	queryTitle.contains("title", _val);
	var queryAddress = new AV.Query("merchants");
	queryAddress.contains("address", _val);	
	var queryA = AV.Query.or(queryAddress, queryTitle);	
	
	var queryKeyword = new AV.Query("merchants");
	queryKeyword.contains("keyword", _val);	
	var query = AV.Query.or(queryA, queryKeyword);
	
	query.select("title","area","category","pic","point","address");
	query.equalTo("visible", true);
	query.near("point", userPoint); 
	query.include("area");
	query.include("category");
	query.limit(limit);
	query.skip(_pIndex * limit);	
	query.find({
		success: function(results) {
		    if (results.length == limit) {
	            _pIndex++;
	        }else{
	            _pIndex = -1
	        }
	        
		    if(results.length>0) {   
	
		        var datas = [];
		        for(var i = 0; i < results.length; i++){
		            var obj = results[i];
		            var pic = obj.get("pic");
		            if(pic){
		                _url = pic.thumbnailURL(100, 80) || "";
		            }else{
		                _url = '';
		            }
		            
		            var area = obj.get("area");
		            if(area){
		                _area = area.get("title") || "";
		            }else{
		                _area = "";
		            }
	                var cate = obj.get("category");
	                if(cate){
	                    _cate = cate.get("title") || "";
	                    if(!_url){
	                        pic = cate.get("pic");
	                        if(pic){
	        	                _url = pic.thumbnailURL(100, 80)._url || "";
	        	            }else{
	        	                _url = '';
	        	            }
	                    }                    
	                }else{
	                    _cate =  "";
	                }
	                
	                var point = obj.get("point");
	                var _poi = {
	                    lat :point.latitude,
	                    lng :point.longitude
	                }
	    	        var ret = {
	    	            id : obj.id,
	    	            title : obj.get("title"),
	    	            url : _url,
	    	            area : _area,
	    	            category : _cate,
	    	            address : obj.get("address") || "",
	    	            point : _poi
	    	        }
		            datas.push(ret);
		        }
		        response.success({datas:datas,pageIndex:_pIndex});
		    }
		    else{
		        response.success({datas:[],pageIndex:_pIndex});
		    }
		},
	    error: function(error) {
	        response.error(JSON.stringify(error));
	    }
	});
});

AV.Cloud.define('searchAct', function(request, response) {
	var _val,_pIndex;
	("value" in request.params) ? _val = request.params.value : _val = "郑瑾茜";
	("pageIndex" in request.params) ? _pIndex = request.params.pageIndex : _pIndex = 0;
	
	var limit = 20;
	
	var queryMerTitle = new AV.Query("merchants");
	queryMerTitle.contains("title", _val);
	var queryMerAddress = new AV.Query("merchants");
	queryMerAddress.contains("address", _val);	
	var queryMerA = AV.Query.or(queryMerAddress, queryMerTitle);	
	var queryMerKeyword = new AV.Query("merchants");
	queryMerKeyword.contains("keyword", _val);	
	var queryMer = AV.Query.or(queryMerA, queryMerKeyword);	
	       
	var queryTitle = new AV.Query("activity");
	queryTitle.contains("title", _val);
	var queryAddr = new AV.Query("activity");
	queryAddr.contains("addr", _val);	
	var queryA = AV.Query.or(queryAddr, queryTitle);
	var queryKeyword = new AV.Query("activity");
	queryKeyword.contains("keyword", _val);		
	var queryB = AV.Query.or(queryA, queryKeyword);
	var querySubTitle = new AV.Query("activity");
	querySubTitle.contains("subTitle", _val);		
	var queryC = AV.Query.or(queryB, querySubTitle);	
	var querySummary = new AV.Query("activity");
	querySummary.contains("summary", _val);		
	var query = AV.Query.or(queryC, querySummary);	
	//var queryTel = new AV.Query("activity");
	//queryTel.contains("tel", value);		
	//var queryE = AV.Query.or(queryD, queryTel);		
			       
	//alert("Area "+ filterArea + "; Cate "+ filterCate);
	//排序
	//var querySort = new AV.Query("activity");
	//querySort.lessThan("sort", 100);  //小于
	//时间排序
	//var queryDate = new AV.Query("activity");
	//queryDate.greaterThanOrEqualTo("sort", 100); // 大于等于    	 
	   //var querySD = AV.Query.or(querySort, queryDate);
	   
	   //var query = AV.Query.or(queryD, querySD);
	query.select(
	   "title","subTitle","price","oriPrice","oriPriceTag","isPrice",
	   "light","logo","pic");
	query.ascending("sort");   
	query.addDescending("createdAt"); 	  	
	query.equalTo("isBanner", false);
	query.equalTo("visible", true);
	//query.equalTo("merchant", queryMer);
	query.limit(limit);
	query.skip(_pIndex * limit);	
	query.find({
		success: function(results) {
		    if (results.length == limit) {
	            _pIndex++;
	        }else{
	            _pIndex = -1
	        }
	        
			if(results.length>0){
	
		        var datas = [];		    
			    for (var i = 0; i < results.length; i++) {
			        var obj = results[i];
			        
			        var _logo = obj.get("logo");
			        if(_logo){
			        	_url = _logo || "";
			        }else{
	                    var pic = obj.get("pic");
	                    if(pic){    
	                        _url = pic.thumbnailURL(100, 80)._url || "";
	    		        }else{
	    		            _url = '';
	    		        }		            
			        }
			        
	    	        var ret = {
	    	            id : obj.id,
	    	            title : obj.get("title") || "",
	    	            subTitle : obj.get("subTitle") || "",
	    	            price:obj.get("price"),
	    	            oriPrice:obj.get("oriPrice"),
	    	            oriPriceTag:obj.get("oriPriceTag") || "",
	    	            isPrice:obj.get("isPrice"),
	    	            url : _url
	    	        }
		            datas.push(ret);				
			    }
			    response.success({datas:datas,pageIndex:_pIndex});
			}
		    else{
		        response.success({datas:[],pageIndex:_pIndex});
		    }		
		},
	    error: function(error) {
	        response.error(error);
	    }
	});
});

AV.Cloud.define('favoriteAct', function(request, response) {
	var _user,_act;
	("user" in request.params) ? _user = request.params.user : _user = "";
	("activity" in request.params) ? _act = request.params.activity : _act = "";
	
	var query = new AV.Query(AV.User);
	query.get(_user, {
	    success: function(userAgain) {
	        var activity =  AV.Object.createWithoutData("activity", _act);
	        var relation = userAgain.relation("favAct");
	        relation.add(activity);
	        userAgain.save(null, {
	            success : function(user) {
	                response.success("收藏成功！");
	            },
	            error: function(user, error) {
	               response.error("收藏失败！");
	            }
	        });
	    },
	    error: function(error) {
	        response.error("收藏失败,用户不存在！");
	    }    
	});
});

AV.Cloud.define('favoriteMer', function(request, response) {
	var _user,_mer;
	("user" in request.params) ? _user = request.params.user : _user = "";
	("merchant" in request.params) ? _mer = request.params.merchant : _mer = "";
	
	var query = new AV.Query(AV.User);
	query.get(_user, {
	    success: function(userAgain) {
	        var merchant =  AV.Object.createWithoutData("merchants", _mer);
	        var relation = userAgain.relation("favMer");
	        relation.add(merchant);
	        userAgain.save(null, {
	            success : function(user) {
	                response.success("收藏成功！");
	            },
	            error: function(user, error) {
	               response.error("收藏失败！");
	            }
	        });
	    },
	    error: function(error) {
	        response.error("收藏失败,用户不存在！");
	    }    
	});
});

function zhMer(obj){
    //var obj = results[i];

    var pic = obj.get("pic");
    if(pic){
        _url = pic.thumbnailURL(100, 80) || "";
    }else{
        _url = '';
    }
    
    var area = obj.get("area");
    if(area){
        _area = area.get("title") || "";
    }else{
        _area = "";
    }
    var cate = obj.get("category");
    if(cate){
        _cate = cate.get("title") || "";
        if(!_url){
            pic = cate.get("pic");
            if(pic){
                _url = pic.thumbnailURL(100, 80) || "";
            }else{
                _url = '';
            }
        }
    }else{
        _cate =  "";
    }
    
    var point = obj.get("point");
    var _poi = {
        lat :point.latitude,
        lng :point.longitude
    }
    var _sort = obj.get("sort") || 999999;
    var ret = {
        id : obj.id,
        title : obj.get("title"),
        url : _url,
        area : _area,
        category : _cate,
        address : obj.get("address") || "",
        point : _poi,
        light:obj.get("light") || false,
        property:obj.get("property") || 0,
        sort:_sort
    }	
	return ret;
}

AV.Cloud.define('merchantsArray', function(request, response) {
	var _aera,_cate,_lat,_lng,_pIndex;
	("area" in request.params) ? _aera = request.params.area : _aera = "";
	("category" in request.params) ? _cate = request.params.category : _cate = "5485257de4b09dd0dec1d78f";
	("latitude" in request.params) ? _lat = Number(request.params.latitude) : _lat = 30.927815;
	("longitude" in request.params) ? _lng = Number(request.params.longitude) : _lng = 113.931961;
	("pageIndex" in request.params) ? _pIndex = Number(request.params.pageIndex) : _pIndex = 0;
	
	var limit = 20;
	
	var userPoint = new AV.GeoPoint({latitude: _lat, longitude: _lng});
	
	if(_cate){
		var queryCateID = new AV.Query("category");
		queryCateID.equalTo("objectId", _cate);
		var queryCatePID = new AV.Query("category");//All
		queryCatePID.equalTo("pId", _cate);	
		var queryCate = AV.Query.or(queryCateID, queryCatePID);
	}
	
	if(_aera){
		var queryAreaID = new AV.Query("area");
		queryAreaID.equalTo("objectId", _aera);
		var queryAreaPID = new AV.Query("area");//All
		queryAreaPID.equalTo("pId", _aera);	
		var queryArea = AV.Query.or(queryAreaID, queryAreaPID);	
	} 
	
	var delNotExist = new AV.Query("merchants");
	delNotExist.doesNotExist("isDelete");
	var delFalse = new AV.Query("merchants");
	delFalse.equalTo("isDelete", false);
	
	var dataSort = [];
	var querySort = AV.Query.or(delNotExist, delFalse);
	querySort.select("title","area","category","pic","point","light","property","sort");
	if(_cate){querySort.matchesQuery("category", queryCate);}
	if(_aera){querySort.matchesQuery("area", queryArea);}	
	querySort.lessThanOrEqualTo("sort", 10000);
	querySort.ascending("sort");
	querySort.include("area");
	querySort.include("category");		
	querySort.find({
		success: function(results) {
			for(var i = 0; i < results.length; i++){
				var obj = results[i];
				var ret = zhMer(obj);
				dataSort.push(ret);
			}
			//return dataSort;
		}
	}).then(function(results){
		//response.success(dataSort);
		
		var query = AV.Query.or(delNotExist, delFalse);
		query.select("title","area","category","pic","point","light","property","sort");
		query.near("point", userPoint); 
		query.equalTo("visible", true);
		query.greaterThan("sort", 10000);
		if(_cate){query.matchesQuery("category", queryCate);}
		if(_aera){query.matchesQuery("area", queryArea);}	
		query.include("area");
		query.include("category");	
		query.limit(limit);
		query.skip(_pIndex * limit);	
		query.find({
			success: function(results) {

		          
		        var datas = [];
		        for(var i = 0; i < results.length; i++){
		            var obj = results[i];	
		            var ret = zhMer(obj);
		            datas.push(ret);
				}
		        if(_pIndex === 0){
		        	datas = dataSort.concat(datas); 
		        }
		        
			    if (results.length == limit) {
		            _pIndex++;
		        }else{
		            _pIndex = -1
		        }		        
		        response.success({datas:datas,pageIndex:_pIndex});
			},
		    error: function(error) {
		        response.error(error);
		    }			            
		});
	});
	//var queryNear = AV.Query.or(delNotExist, delFalse);
	//queryNear.greaterThan("sort", 10000);
	//queryNear.near("point", userPoint); 


	/*
	var query = AV.Query.or(delNotExist, delFalse);
	query.select("title","area","category","pic","point","light","property","sort");
	query.near("point", userPoint); 
	query.equalTo("visible", true);
	query.greaterThan("sort", 10000);
	if(_cate){query.matchesQuery("category", queryCate);}
	if(_aera){query.matchesQuery("area", queryArea);}	
	query.include("area");
	query.include("category");	
	query.limit(limit);
	query.skip(_pIndex * limit);	
	query.find({
		success: function(results) {
		    if (results.length == limit) {
	            _pIndex++;
	        }else{
	            _pIndex = -1
	        }
	        
	        if(results.length>0) {   
		        var datas = [];
		        var dataTop = [];
		        for(var i = 0; i < results.length; i++){
		            var obj = results[i];
	
		            var pic = obj.get("pic");
		            if(pic){
		                _url = pic.thumbnailURL(100, 80) || "";
		            }else{
		                _url = '';
		            }
		            
		            var area = obj.get("area");
		            if(area){
		                _area = area.get("title") || "";
		            }else{
		                _area = "";
		            }
	                var cate = obj.get("category");
	                if(cate){
	                    _cate = cate.get("title") || "";
	                    if(!_url){
	                        pic = cate.get("pic");
	                        if(pic){
	        	                _url = pic.thumbnailURL(100, 80) || "";
	        	            }else{
	        	                _url = '';
	        	            }
	                    }
	                }else{
	                    _cate =  "";
	                }
	                
	                var point = obj.get("point");
	                var _poi = {
	                    lat :point.latitude,
	                    lng :point.longitude
	                }
	                var _sort = obj.get("sort") || 999999;
	    	        var ret = {
	    	            id : obj.id,
	    	            title : obj.get("title"),
	    	            url : _url,
	    	            area : _area,
	    	            category : _cate,
	    	            address : obj.get("address") || "",
	    	            point : _poi,
	    	            light:obj.get("light") || false,
	    	            property:obj.get("property") || 0,
	    	            sort:_sort
	    	        }
	    	        if(_sort>10000){
		            	datas.push(ret);
		            }else{
		            	dataTop.push(ret);
		            }
		        }
		        dataTop.sort(function(a,b){return a.sort-b.sort});
		        dataTop = dataTop.concat(datas); 
		        response.success({datas:dataTop,pageIndex:_pIndex});
		    }
		    else{
		        response.success({datas:[],pageIndex:_pIndex});
		    }        
		},
	    error: function(error) {
	        response.error(error);
	    }
	});*/
});

AV.Cloud.define('activityArray', function(request, response) {
var _aera,_cate,_lat,_lng,_pIndex;
("area" in request.params) ? _aera = request.params.area : _aera = "";
("category" in request.params) ? _cate = request.params.category : _cate = "";
("latitude" in request.params) ? _lat = Number(request.params.latitude) : _lat = 30.927815;
("longitude" in request.params) ? _lng = Number(request.params.longitude) : _lng = 113.931961;
("pageIndex" in request.params) ? _pIndex = Number(request.params.pageIndex) : _pIndex = 0;

var limit = 20;

if(_cate){
	var queryCateID = new AV.Query("category");
	queryCateID.equalTo("objectId", _cate);
	var queryCatePID = new AV.Query("category");//All
	queryCatePID.equalTo("pId", _cate);	
	var queryCate = AV.Query.or(queryCateID, queryCatePID);
}

if(_aera){
	var queryAreaID = new AV.Query("area");
	queryAreaID.equalTo("objectId", _aera);
	var queryAreaPID = new AV.Query("area");//All
	queryAreaPID.equalTo("pId", _aera);	
	var queryArea = AV.Query.or(queryAreaID, queryAreaPID);	
}    
//排序
var querySort = new AV.Query("activity");
querySort.lessThan("sort", 100);  //小于
//时间排序
var queryDate = new AV.Query("activity");
queryDate.greaterThanOrEqualTo("sort", 100); // 大于等于    	 
var queryA = AV.Query.or(querySort, queryDate);

var delNotExist = new AV.Query("activity");
delNotExist.doesNotExist("isDelete");
var delFalse = new AV.Query("activity");
delFalse.equalTo("isDelete", false);
var queryB = AV.Query.or(delNotExist, delFalse);

var query = AV.Query.or(queryA, queryB);
query.select("logo","pic","title","subTitle","price","oriPrice","oriPriceTag","light","isPrice");
query.ascending("sort");   
query.addDescending("createdAt"); 	  	
query.equalTo("isBanner", false);
query.equalTo("visible", true);
query.equalTo("isDelete", false);
if(_cate){
    query.matchesQuery("category", queryCate);
}
if(_aera){
    query.matchesQuery("area", queryArea);
}

query.limit(limit);
query.skip(_pIndex * limit);	
query.find({
	success: function(results) {
	    if (results.length == limit) {
            _pIndex++;
        }else{
            _pIndex = -1
        }
	    if(results.length>0) {   
	        
	        var datas = [];
	        for(var i = 0; i < results.length; i++){
	            var obj = results[i];
	            
		        var _logo = obj.get("logo");
		        if(_logo){
		        	_url = _logo || "";
		        }else{
                    var pic = obj.get("pic");
                    if(pic){    
                        _url = pic.thumbnailURL(100, 80) || "";
    		        }else{
    		            _url = '';
    		        }		            
		        }

		        
    	        var ret = {
    	            id : obj.id,
    	            title : obj.get("title") || "",
    	            subTitle : obj.get("subTitle") || "",
    	            price:obj.get("price"),
    	            oriPrice:obj.get("oriPrice"),
    	            oriPriceTag:obj.get("oriPriceTag") || "",
    	            isPrice:obj.get("isPrice"),
    	            light:obj.get("light") || false,
    	            url : _url
    	        }	            
	            
	            datas.push(ret);
	        }
	        response.success({datas:datas,pageIndex:_pIndex});
	    }
	    else{
	        response.success({datas:[],pageIndex:_pIndex});
	    }	    
	},
    error: function(error) {
        response.error(error);
    }
});
});

AV.Cloud.define('homeAct', function(request, response) {
var limit = 20;

//排序
var querySort = new AV.Query("activity");
querySort.lessThan("sort", 100);  //小于
//时间排序
var queryDate = new AV.Query("activity");
queryDate.greaterThanOrEqualTo("sort", 100); // 大于等于    	 
var queryA = AV.Query.or(querySort, queryDate);

var delNotExist = new AV.Query("activity");
delNotExist.doesNotExist("isDelete");
var delFalse = new AV.Query("activity");
delFalse.equalTo("isDelete", false);
var queryB = AV.Query.or(delNotExist, delFalse);

var query = AV.Query.or(queryA, queryB);
query.select("logo","pic","title","subTitle","price","oriPrice","oriPriceTag","light","isPrice");
query.ascending("sort");   
query.addDescending("createdAt"); 	  	
query.equalTo("isBanner", false);
query.equalTo("visible", true);
query.equalTo("isDelete", false);

query.limit(limit);
query.find({
	success: function(results) {
	    if (results.length == limit) {
            _pIndex++;
        }else{
            _pIndex = -1
        }
	    if(results.length>0) {   
	        
	        var datas = [];
	        for(var i = 0; i < results.length; i++){
	            var obj = results[i];
	            
		        var _logo = obj.get("logo");
		        if(_logo){
		        	_url = _logo || "";
		        }else{
                    var pic = obj.get("pic");
                    if(pic){  
                        _url = pic.thumbnailURL(100, 80) || "";
    		        }else{
    		            _url = '';
    		        }		            
		        }

		        
    	        var ret = {
    	            id : obj.id,
    	            title : obj.get("title") || "",
    	            subTitle : obj.get("subTitle") || "",
    	            price:obj.get("price"),
    	            oriPrice:obj.get("oriPrice"),
    	            oriPriceTag:obj.get("oriPriceTag") || "",
    	            isPrice:obj.get("isPrice"),
    	            light:obj.get("light") || false,
    	            url : _url
    	        }	            
	            
	            datas.push(ret);
	        }
	        response.success({datas:datas,pageIndex:_pIndex});
	    }
	    else{
	        response.success({datas:[],pageIndex:_pIndex});
	    }	    
	},
    error: function(error) {
        response.error(error);
    }
});
	
});

AV.Cloud.define('getCategory', function(request, response) {
var _type;
("type" in request.params) ? _type = Number(request.params.type) : _type = 0;

if(_type>0){
    var queryNotExistDelete = new AV.Query("category");
    queryNotExistDelete.doesNotExist("isDelete");
    var queryExistDelete = new AV.Query("category");
    queryExistDelete.equalTo("isDelete", false);
    var queryA = AV.Query.or(queryNotExistDelete, queryExistDelete);
    
    //queryDelete.exists("isDelete");
    var queryCate = new AV.Query("category");
    var query = AV.Query.and(queryA, queryCate);
    query.select("title","pId","haveSub","light");
    query.ascending("sort");
    if(_type === 1){
        query.equalTo("mVisible", true);
    }
    if(_type === 2){
        query.equalTo("aVisible", true);
    }  
    query.find({
        success: function(results) {
            response.success(results);
        },
        error: function(error) {
            response.error(error);
        }
    });
}
else{
    response.success([]);
}

});

AV.Cloud.define('getBanner', function(request, response) {
var banner = AV.Object.extend("banner");
var query = new AV.Query(banner);
query.ascending("sort");
query.equalTo("visible", true);
query.find({
    success: function(results) {
        var datas = [];
        for (var i = 0; i < results.length; i++) {
            var obj = results[i];
            var res = {
                id : obj.id,
                url : obj.get("pic")._url,
                showPage : obj.get("showPage") || ""
            }
            datas.push(res);
        }
        response.success(datas);
    },
    error: function(error) {
        response.error(error);
    }
});
});

AV.Cloud.define('getArea', function(request, response) {
var _type;
("type" in request.params) ? _type = Number(request.params.type) : _type = 0;

if(_type>0){
    var queryNotExistDelete = new AV.Query("area");
    queryNotExistDelete.doesNotExist("isDelete");
    var queryExistDelete = new AV.Query("area");
    queryExistDelete.equalTo("isDelete", false);
    var queryA = AV.Query.or(queryNotExistDelete, queryExistDelete);
    
    //queryDelete.exists("isDelete");
    var queryCate = new AV.Query("area");
    var query = AV.Query.and(queryA, queryCate);
    query.select("title","pId","haveSub");
    query.ascending("sort");
    if(_type === 1){
       
    }
    if(_type === 2){
        query.equalTo("aVisible", true);
    }  
    query.find({
        success: function(results) {
            response.success(results);
        },
        error: function(error) {
            response.error(error);
        }
    });
}
else{
    response.success([]);
}

});

function addRenqi(request) {
	var  _merId,_devId;
	("merchant" in request.params) ? _merId = request.params.merchant : _merId = "";
	("deviceId" in request.params) ? _devId = request.params.deviceId : _devId = deviceId;
	
	if((_devId!=="")&&(_merId!=="")){
		var _day = new Date().Format("yyyy-MM-dd");  
		var _dayBegin = _day + ' 00:00:00';
		var _dayEnd = _day + ' 23:59:59';
		//console.log(_dayBegin);
		var merchant =  AV.Object.createWithoutData("merchants", _merId);
	  query = new AV.Query("merRenqi");
	  query.equalTo('deviceId', _devId);
	  query.equalTo('merchant', merchant);
	  query.greaterThanOrEqualTo('createdAt', new Date(_dayBegin));
	  query.lessThanOrEqualTo('createdAt', new Date(_dayEnd));
	  query.find({
	    success: function(results) {
	    	//console.log(JSON.stringify(results));
		  	if((results.length<=0)){
		  		
		  		var devices = AV.Object.extend("merRenqi");
		  		var device = new devices();
			 	device.set("deviceId", _devId);
				device.set("merchant", merchant);
				device.save(null, {
					  success: function(info) {
				 		//console.log(JSON.stringify(info));
					  },
					  error: function(info, error) {
						//console.log(JSON.stringify(error));
					  }
				}).then(
				  	function(object) {
					  queryMer = new AV.Query("merchants");
					  queryMer.get(_merId, {
					    success: function(mer) {
					    	var _rq = mer.get("renqi");
					    	if(_rq>99){
					    		mer.increment("renqi");
					    	}
					    	else{
					    		mer.set("renqi",100)
					    	}
					      		
					      	//var relationMer = merchant.relation("comments");
					       	//relationMer.add(request.object);
					      	mer.save().then(
								function(object){
					                
								}, function(error) {
			
					            }
							);
						},
					    error: function(error) {
					    }
					  });	  		
				  	}, function(error) {
			            response.error(error);     
			        }
				  	
				  );  				
			}
		},
	    error: function(error) {
	    	//console.log(JSON.stringify(error));
	    }
	  });
	}
}

AV.Cloud.define('getMer', function(request, response) {
var  _id,_devId;

("id" in request.params) ? _id = request.params.id : _id = "-1";
("deviceId" in request.params) ? _devId = request.params.deviceId : _devId = "";

if(_id!=='-1'){
    var it;
    var actArray = [];
    var otherArray = [];
    var otherDate = new Date();
    var property = 0;
    var commentCount = 0;
    var merchants = AV.Object.extend("merchants");
    var query = new AV.Query(merchants);    
	query.include("area");
	query.include("category");    
    query.get(_id, {
        success: function(obj){
	        var _url = '';
	        var _dz = obj.get("dianzhao"); //店招
	        if(_dz){_url = _dz;}
	        else{
		        var pic = obj.get("pic");
				if(pic){_url = pic._url;} 	        	
	        }

			
	        var point = obj.get("point");
            if(point){
        	    _gp = {
                	lon : point.longitude,
                	lat : point.latitude,
                	title : obj.get("title"),
                	tel : obj.get("phoneNumber") || ""        	        
        	    }
            }else{
        	    _gp = {
                	lon : 0,
                	lat : 0,
                	title : obj.get("title"),
                	tel : obj.get("phoneNumber") || ""        	        
        	    }                
            }
            
            var _renqi = obj.get("renqi") || 100;
            var _zao = " 早 "+obj.get("beginTime") || "8:00";
            var _wan = "-晚 "+ obj.get("endTime") || "9:00" ;
            var _yingye = _zao+ _wan;
            
            property = obj.get("property") || 0,
            commentCount = obj.get("commentNum") || 0,
            
        	it = {
    			objectId:obj.id,
    			url:_url,
    			title:obj.get("title") ||"",
    			//summary:obj.get("summary"),
    			address:obj.get("address") ||"",
    			phoneNumber:obj.get("phoneNumber") ||"",
    			content:obj.get("content") || "",
    			gp:_gp,
    			renqi:_renqi,
    			yingye:_yingye
		    }
		    
		    //var actArray = [];
		    var relation = obj.relation("activity"); 
	        var queryAct = relation.query();
            queryAct.limit(3);
		    queryAct.find({
			    success: function(activitys) {
			       // var actArray = [];
				    for (var i = 0; i < activitys.length; i++) {
				        var actObj = activitys[i];

        		        var _logo = actObj.get("logo");
        		        if(_logo){
        		        	_url = _logo || "";
        		        }else{
                            var pic = actObj.get("pic");
                            if(pic){    
                                _url = pic._url || "";
            		        }else{
            		            _url = '';
            		        }		            
        		        }
						
				        var ait = {
				        	objectId:actObj.id,
				        	title:actObj.get("title") ||"",
				        	subTitle:actObj.get("subTitle") ||"",
				        	price:actObj.get("price") || 0,
				        	oriPrice:actObj.get("oriPrice") || 0,
				        	oriPriceTag:actObj.get("oriPriceTag") || "",
				        	isPrice:actObj.get("isPrice") || false,
				        	url:_url
				        }
				        actArray.push(ait);
				    }
				    response.success({mer:it,acts:actArray,otherArray:otherArray,otherDate:otherDate,commentCount:commentCount});
			    },
                error: function(error) {
                    response.success({mer:it,acts:actArray,otherArray:otherArray,otherDate:otherDate,commentCount:commentCount});
                }
		    });
        },
        error: function(object, error) {
            response.error(error);        
        }
        
    }).then(
        function(object) {
			 addRenqi({params:{merchant: _id,deviceId:_devId}});      	
			/*var merchant =  AV.Object.createWithoutData("merchants", _id);
			var queryComm = new AV.Query("merComments");
			queryComm.equalTo("merchant", merchant);
            queryComm.count({
                success: function(count) {
                    response.success({mer:it,acts:actArray,otherArray:otherArray,otherDate:otherDate,commentCount:count});
                },
                error: function(error) {
                    response.success({mer:it,acts:actArray,otherArray:otherArray,otherDate:otherDate,commentCount:0});
                }
            });	 */       
            //response.success({mer:it,acts:actArray,otherArray:otherArray,otherDate:otherDate});
            /*if(property===1){//电影
	            var merId =  AV.Object.createWithoutData("merchants", _id);
	            if(merId){
                    var filmQuery = new AV.Query("filmProjectionGroup");
    	            filmQuery.equalTo("merchant", merId);
    	            filmQuery.ascending("sort");
    	            filmQuery.addDescending("date"); 
                    filmQuery.find({
                    	success: function(results) {
                    	    if(results.length>0) {
                    	        var fpg = results[0];
                    	        otherDate = fpg.get('date');
                    	        var fpRelation = fpg.relation("projection");
                    	        var queryFP = fpRelation.query();
                    	        queryFP.include("film");
                    	        queryFP.find({ 
                    	            success: function(pro) {
                    	                for (var i = 0; i < pro.length; i++) {
                                	        var fobj = pro[i];
                                	        var ft = fobj.get('film');
                                	        var pic = ft.get("pic");
                                            if(pic){    
                                                _url = pic._url || "";
                            		        }else{
                            		            _url = '';
                            		        }		    
                                	        var fit = {
                                	            objectId : fobj.id,
                                	            title : ft.get('title'),
                                	            director : ft.get('director'),
                                	            performer : ft.get('performer'),
                                	            url:_url
                                	            
                                	        }
                                	        otherArray.push(fit);
                    	                }
                    	                response.success({mer:it,acts:actArray,otherArray:otherArray,otherDate:otherDate});
                    	            }
                    	       });
                    	        
                    	    }
                    	    else{
                    	        response.success({mer:it,acts:actArray,otherArray:otherArray,otherDate:otherDate});
                    	    }
                    	   // response.success({mer:it,acts:actArray,otherArray:otherArray});
                    	},
                        error: function(error) {
                            response.success({mer:it,acts:actArray,otherArray:otherArray,otherDate:otherDate});
                        }
                    });
                }else {
                    response.success({mer:it,acts:actArray,otherArray:otherArray,otherDate:otherDate});
                }
            }else{
                response.success({mer:it,acts:actArray,otherArray:otherArray,otherDate:otherDate});
            }*/
           
        }, function(error) {
            response.error(error);     
        }
    );
}else{
    response.success(-1);
}
});

AV.Cloud.define('getLifeService', function(request, response) {
var lifeService = AV.Object.extend("lifeService");
var queryService = new AV.Query(lifeService);
queryService.ascending("sort");  
queryService.equalTo("visible", true);
queryService.find({
    success: function(results) {
        if(results.length>0) {
            var datas = [];
            for(var i = 0; i < results.length; i++){
                var obj = results[i];

	            var pic = obj.get("pic");
	            if(pic){
	                _url = pic._url || "";
	            }else{
	                _url = '';
	            }   
	            
    	        var ret = {
    	            id : obj.id,
    	            title : obj.get("title"),
    	            url : obj.get("url"),
    	            pic : _url
    	        }
    	        datas.push(ret);
            }
            response.success(datas);
        }else{
            response.success([]);
        }
    },
    error: function(error) {
        response.error(error);
    }
});
});

AV.Cloud.define('getForums', function(request, response) {
var datas = [];

var ppp = AV.Promise.as(datas);

ppp = ppp.then(function(){
    
	var lifeService = AV.Object.extend("forum");
	var queryService = new AV.Query(lifeService);
	queryService.ascending("sort");
	queryService.equalTo("visible", true);	
	queryService.find().then(function(forums){
		var promise = AV.Promise.as();
		//var _ = require('underscore');
		AV._.each(forums,function(forum){
			promise = promise.then(function(){
			//	var relation = forum.relation("topics");
			//	var queryTopics = relation.query();
		
				var logo = forum.get("logo");
				if (logo) {
					_logo = logo._url || "";
				} else {
					_logo = '';
				}
				var ret = {
					id: forum.id,
					title: forum.get("title"),
					logo: _logo,
					//count: 0
				}
				//datas.push(ret);
				return ret;
			}).then(function(result){
				var relation = forum.relation("topics");
				var queryTopics = relation.query();	
				queryTopics.count({
					success: function(count) {
						result.count = count;
						datas.push(result);
						//response.success(datas);
					},
					error: function(error) {
						result.count = 0;
						datas.push(result);   
						//response.success(datas);
					}
				});
			   
			});
		});
		return promise;
		//
	}).then(function(aa){
		return aa;
	});
}).then(function(aa){
		response.success(datas);
});
});

AV.Cloud.define('pubTopic', function(request, response) {
var _user,_forum,_con;

("publisher" in request.params) ? _user = request.params.publisher : _user = "";
("forum" in request.params) ? _forum = request.params.forum : _forum = "";
("content" in request.params) ? _con = request.params.content : _con = "";


var user =  AV.Object.createWithoutData("_User", _user);
var forum =  AV.Object.createWithoutData("forum", _forum);
if(_forum && _user && _con){
    var forumTopics = new AV.Object("forumTopics");
    forumTopics.set("publisher", user);
    forumTopics.set("forum", forum);
    forumTopics.set("content", _con);
    forumTopics.save(null, {
        success: function(topic) {
            
            var relationForum = forum.relation("topics");
            relationForum.add(topic);
            forum.save().then(
                function(object) {
                    var relation = user.relation("topics");
                    relation.add(topic);
                    user.save(null, {
                        success: function(result) {
                            
                            var publisher = topic.get("publisher");
                            publisher.fetch({
                              success: function(res) {
                                
                                _name= res.get("nickName") || res.get("username");
                                _headUrl= res.get("headUrl") || ""; 
                                
                	            var _publisher = {
                	                id:res.id,
                	                name:_name,
                	                headUrl:_headUrl
                	            }  
                	            
              	                var _cd = jsDateDiff(topic.createdAt);
                    			var ret = {
                    				id: topic.id,
                    				content: topic.get("content") || "",
                    				publisher:_publisher,
                    			    timeStr:_cd
                    			}	                            
                                response.success({message:"发表成功！",result:ret});                                
                              }
                            });
                            
  
                        }
                    });
                }, function(error) {
                   response.error("发表失败(01)"); 
                }
            );
        },
        error: function(topic, error) {
            response.error("发表失败(" + error.code + ")"); 
        }
    });      
}else{
    response.error("发表失败(20)"); 
}
});

AV.Cloud.define('getTopics', function(request, response) {
var _forum,_pIndex;
("forum" in request.params) ? _forum = request.params.forum : _forum = "";
("pageIndex" in request.params) ? _pIndex = Number(request.params.pageIndex) : _pIndex = 0;

var limit = 20;

if(_forum){
    var forum =  AV.Object.createWithoutData("forum", _forum);
    var datas = [];
    var query = new AV.Query("forumTopics");
    query.descending("createdAt");
    query.equalTo("forum", forum);
    query.exists("publisher");
    query.include("publisher");
    query.limit(limit);
    query.skip(_pIndex * limit);	    
    query.find().then(function(topics){
        if (topics.length == limit) {
            _pIndex++;
        }else{
            _pIndex = -1
        }
    	var promise = AV.Promise.as();

    	AV._.each(topics,function(topic){
    		promise = promise.then(function(){
    		    
                var user = topic.get("publisher");
	            _name= user.get("nickName") || user.get("username");
	            _headUrl= user.get("headUrl") || "";
	            
	            var _publisher = {
	                id:user.id,
	                name:_name,
	                headUrl:_headUrl
	            }
	            var _cd = jsDateDiff(topic.createdAt);
	            
    			var ret = {
    				id: topic.id,
    				content: topic.get("content") || "",
    			    publisher:_publisher,
    			    timeStr:_cd
    			}
    			datas.push(ret);					
    		});		
    			
    	});
    }).then(function(){
    	response.success({datas:datas,pageIndex:_pIndex});
    });    
}
});

AV.Cloud.afterSave("merComments", function(request) {
  query = new AV.Query("merchants");
  query.get(request.object.get("merchant").id, {
    success: function(merchant) {
      	merchant.increment("commentNum");
      	var relationMer = merchant.relation("comments");
       	relationMer.add(request.object);
      	merchant.save().then(
			function(object){
                var queryUser = new AV.Query("_User");
                queryUser.get(request.object.get("publisher").id, {
    				success: function(user) {
    					var relationUser = user.relation("merComments");
                    	relationUser.add(request.object);
    					user.save();
    				},
    				error: function(error) {
    					response.error("发表失败(02)"); 
				    }
    			});
			}, function(error) {
            	response.error("发表失败(01)"); 
            }
		);
	},
    error: function(error) {
    }
  });
});

AV.Cloud.define('pubMerComment', function(request, response) {
var _user,_mer,_con;

("publisher" in request.params) ? _user = request.params.publisher : _user = "";
("merchant" in request.params) ? _mer = request.params.merchant : _mer = "";
("content" in request.params) ? _con = request.params.content : _con = "";


var user =  AV.Object.createWithoutData("_User", _user);
var merchant =  AV.Object.createWithoutData("merchants", _mer);
if(_mer && _user && _con){
    var merComments = new AV.Object("merComments");
    merComments.set("publisher", user);
    merComments.set("merchant", merchant);
    merComments.set("content", _con);
    merComments.save(null, {
        success: function(comment) {
			var publisher = comment.get("publisher");
            publisher.fetch({
              success: function(res) {
                
                _name= res.get("nickName") || res.get("username");
                _headUrl= res.get("headUrl") || ""; 
                
	            var _publisher = {
	                id:res.id,
	                name:_name,
	                headUrl:_headUrl
	            }  
	            
                var _cd = jsDateDiff(comment.createdAt);
    			var ret = {
    				id: comment.id,
    				content: comment.get("content") || "",
    				publisher:_publisher,
    			    timeStr:_cd
    			}	                            
                response.success({message:"发表成功！",result:ret});                                
              }
            });      	
            //response.success({message:"发表成功！",result:{}});  
            /*var relationMer = merchant.relation("comments");
            relationMer.add(comment);
            merchant.save().then(
                function(object) {
                    var relation = user.relation("merComments");
                    relation.add(comment);
                    user.save(null, {
                        success: function(result) {
                            
                            var publisher = comment.get("publisher");
                            publisher.fetch({
                              success: function(res) {
                                
                                _name= res.get("nickName") || res.get("username");
                                _headUrl= res.get("headUrl") || ""; 
                                
                	            var _publisher = {
                	                id:res.id,
                	                name:_name,
                	                headUrl:_headUrl
                	            }  
                	            
              	                var _cd = jsDateDiff(comment.createdAt);
                    			var ret = {
                    				id: comment.id,
                    				content: comment.get("content") || "",
                    				publisher:_publisher,
                    			    timeStr:_cd
                    			}	                            
                                response.success({message:"发表成功！",result:ret});                                
                              }
                            });
                            
  
                        }
                    });
                }, function(error) {
                   response.error("发表失败(01)"); 
                }
            );*/
        },
        error: function(topic, error) {
            response.error("发表失败(" + error.code + ")"); 
        }
    });      
}else{
    response.error("发表失败(20)"); 
}
});

AV.Cloud.define('getMerComments', function(request, response) {
var _mer,_pIndex;
("merchant" in request.params) ? _mer = request.params.merchant : _mer = "";
("pageIndex" in request.params) ? _pIndex = Number(request.params.pageIndex) : _pIndex = 0;

var limit = 10;

if(_mer){
    var merchant =  AV.Object.createWithoutData("merchants", _mer);
    var datas = [];
    var query = new AV.Query("merComments");
    query.descending("createdAt");
    query.equalTo("merchant", merchant);
    query.exists("publisher");
    query.include("publisher");
    query.limit(limit);
    query.skip(_pIndex * limit);	    
    query.find().then(function(comments){
        if (comments.length == limit) {
            _pIndex++;
        }else{
            _pIndex = -1
        }
    	var promise = AV.Promise.as();
    	
    	AV._.each(comments,function(comment){
    		promise = promise.then(function(){
    		    
                var user = comment.get("publisher");
	            _name= user.get("nickName") || user.get("username");
	            _headUrl= user.get("headUrl") || "";
	            
	            var _publisher = {
	                id:user.id,
	                name:_name,
	                headUrl:_headUrl
	            }
	            var _cd = jsDateDiff(comment.createdAt);
	            
    			var ret = {
    				id: comment.id,
    				content: comment.get("content") || "",
    			    publisher:_publisher,
    			    timeStr:_cd
    			}
    			datas.push(ret);					
    		});		
    			
    	});
    }).then(function(){
    	response.success({datas:datas,pageIndex:_pIndex});
    });    
}
});

AV.Cloud.afterSave("actComments", function(request) {
  query = new AV.Query("activity");
  query.get(request.object.get("activity").id, {
    success: function(activity) {
      	activity.increment("commentNum");
      	var relationAct = activity.relation("comments");
       	relationAct.add(request.object);
      	activity.save().then(
			function(object){
                var queryUser = new AV.Query("_User");
                queryUser.get(request.object.get("publisher").id, {
    				success: function(user) {
    					var relationUser = user.relation("actComments");
                    	relationUser.add(request.object);
    					user.save();
    				},
    				error: function(error) {
    					response.error("发表失败(02)"); 
				    }
    			});
			}, function(error) {
            	response.error("发表失败(01)"); 
            }
		);
	},
    error: function(error) {
    }
  });
});

AV.Cloud.define('pubActComment', function(request, response) {
var _user,_act,_con;

("publisher" in request.params) ? _user = request.params.publisher : _user = "";
("activity" in request.params) ? _act = request.params.activity : _act = "";
("content" in request.params) ? _con = request.params.content : _con = "";


var user =  AV.Object.createWithoutData("_User", _user);
var activity =  AV.Object.createWithoutData("activity", _act);
if(_act && _user && _con){
    var merComments = new AV.Object("actComments");
    merComments.set("publisher", user);
    merComments.set("activity", activity);
    merComments.set("content", _con);
    merComments.save(null, {
        success: function(comment) {
            var publisher = comment.get("publisher");
            publisher.fetch({
              success: function(res) {
                
                _name= res.get("nickName") || res.get("username");
                _headUrl= res.get("headUrl") || ""; 
                
	            var _publisher = {
	                id:res.id,
	                name:_name,
	                headUrl:_headUrl
	            }  
	            
                var _cd = jsDateDiff(comment.createdAt);
    			var ret = {
    				id: comment.id,
    				content: comment.get("content") || "",
    				publisher:_publisher,
    			    timeStr:_cd
    			}	                            
                response.success({message:"发表成功！",result:ret});                                
              }
            });            
            /*var relationAct = activity.relation("comments");
            relationAct.add(comment);
            activity.save().then(
                function(object) {
                    var relation = user.relation("actComments");
                    relation.add(comment);
                    user.save(null, {
                        success: function(result) {
                            
                            var publisher = comment.get("publisher");
                            publisher.fetch({
                              success: function(res) {
                                
                                _name= res.get("nickName") || res.get("username");
                                _headUrl= res.get("headUrl") || ""; 
                                
                	            var _publisher = {
                	                id:res.id,
                	                name:_name,
                	                headUrl:_headUrl
                	            }  
                	            
              	                var _cd = jsDateDiff(comment.createdAt);
                    			var ret = {
                    				id: comment.id,
                    				content: comment.get("content") || "",
                    				publisher:_publisher,
                    			    timeStr:_cd
                    			}	                            
                                response.success({message:"发表成功！",result:ret});                                
                              }
                            });
                            
  
                        }
                    });
                }, function(error) {
                   response.error("发表失败(01)"); 
                }
            );*/
        },
        error: function(topic, error) {
            response.error("发表失败(" + error.code + ")"); 
        }
    });      
}else{
    response.error("发表失败(20)"); 
}
});

AV.Cloud.define('getActComments', function(request, response) {
var _act,_pIndex;
("activity" in request.params) ? _act = request.params.activity : _act = "";
("pageIndex" in request.params) ? _pIndex = Number(request.params.pageIndex) : _pIndex = 0;

var limit = 10;

if(_act){
    var activity =  AV.Object.createWithoutData("activity", _act);
    var datas = [];
    var query = new AV.Query("actComments");
    query.descending("createdAt");
    query.equalTo("activity", activity);
    query.exists("publisher");
    query.include("publisher");
    query.limit(limit);
    query.skip(_pIndex * limit);	    
    query.find().then(function(comments){
        if (comments.length == limit) {
            _pIndex++;
        }else{
            _pIndex = -1
        }
    	var promise = AV.Promise.as();
    	
    	AV._.each(comments,function(comment){
    		promise = promise.then(function(){
    		    
                var user = comment.get("publisher");
	            _name= user.get("nickName") || user.get("username");
	            _headUrl= user.get("headUrl") || "";
	            
	            var _publisher = {
	                id:user.id,
	                name:_name,
	                headUrl:_headUrl
	            }
	            var _cd = jsDateDiff(comment.createdAt);
	            
    			var ret = {
    				id: comment.id,
    				content: comment.get("content") || "",
    			    publisher:_publisher,
    			    timeStr:_cd
    			}
    			datas.push(ret);					
    		});		
    			
    	});
    }).then(function(){
    	response.success({datas:datas,pageIndex:_pIndex});
    });    
}
});

AV.Cloud.define('getAct', function(request, response) {
	var  _id;
	
	("id" in request.params) ? _id = request.params.id : _id = "-1";
	
	if(_id!=='-1'){
	    var it;
	    var activity = AV.Object.extend("activity");
	    var query = new AV.Query(activity);    
		query.include("merchant");
	    query.get(_id, {
	        success: function(obj){
				 //读取该活动的商家信息
				var _mer = obj.get("merchant");
				var _merId;
				var _merDz = ""; //店招
				var gp,_addr,_tel,pic;
				if(_mer){
					 gp = obj.get("gp") || _mer.get("point");
					 _addr = obj.get("addr") || _mer.get("address");
					 _tel = obj.get("tel") || _mer.get("phoneNumber");
					 pic = obj.get("pic") || _mer.get("pic");
					_merDz = obj.get("picurl") ||_mer.get("dianzhao");
					_merId = _mer.id;
				}else{
					gp = obj.get("gp");
					_addr = obj.get("addr");
					_tel = obj.get("tel");
					pic = obj.get("pic");
					_merDz = obj.get("picurl");
					_merId = "";
				}
				
				var _gp = {};
					_gp.lon = gp.longitude;
					_gp.lat = gp.latitude;
					_gp.title = obj.get("title");
					_gp.tel = obj.get("tel");
	
				var _url = _merDz;
				if(pic){_url = pic._url;}	
	            
				var it = {
					objectId:obj.id,
					url:_url || "",
					title:obj.get("title"),
					summary:obj.get("summary") || "",
					address:_addr || "",
					phoneNumber:_tel || "",
					content:obj.get("content") || "",
					price:obj.get("price"),
					oriPrice:obj.get("oriPrice"),
					isPrice:obj.get("isPrice"),
					point:_gp,
					MerchantId: _merId,
				}
				
				var commentCount = obj.get("commentNum") || 0;
				response.success({act:it,commentCount:commentCount});
			    //response.success({act:it})
			   /* var relation = obj.relation("comments"); 
		        var queryComm = relation.query();
	            queryComm.count({
	                success: function(count) {
	                    response.success({act:it,commentCount:count});
	                },
	                error: function(error) {
	                    response.success({act:it,commentCount:0});
	                }
			    });*/
	        },
	        error: function(object, error) {
	            response.error(error);        
	        }
	        
	    });
	}else{
	    response.success(-1);
	}
});

AV.Cloud.define('publishMer', function(request, response) {
	var _fname,_base64, _tit,_tel,_addr,_kw,_lat,_lng,_user,_url;
	
	//("fileName" in request.params) ? _fname = request.params.fileName : _fname = "";
	//("base64" in request.params) ? _base64 = request.params.base64 : _base64 = "";
	("title" in request.params) ? _tit = request.params.title : _tit = "";
	("phoneNumber" in request.params) ? _tel = request.params.phoneNumber : _tel = "";
	("address" in request.params) ? _addr = request.params.address : _addr = "";
	("keyword" in request.params) ? _kw = request.params.keyword : _kw = "";
	("lat" in request.params) ? _lat = request.params.lat : _lat = "";
	("lng" in request.params) ? _lng = request.params.lng : _lng = "";
	("publisher" in request.params) ? _user = request.params.publisher : _user = "";
	("picurl" in request.params) ? _url = request.params.picurl : _url = "";
	
	//if(_base64 && _fname){
	//    var imgFile = new AV.File(_fname, {base64:_base64});
	//    imgFile.save().then(
	//        function(theFile) {
	            var publishMer = new AV.Object("publishMer");
	            //var publishMer = new AV.Object("merchants");
	            publishMer.set("title", _tit);
	            publishMer.set("phoneNumber", _tel);
	            publishMer.set("address", _addr);
	            publishMer.set("keyword", _kw);
	            
	            if(_lat && _lng){
	                var point = new AV.GeoPoint({latitude: Number(_lat), longitude: Number(_lng)});
	                if(point){
	                    publishMer.set("point", point);
	                }
	            }
	            
	            if(_user){
	                var user = new AV.User();
	                user.id = _user;
	                publishMer.set("publisher", user);
	            }
	            publishMer.set("picurl", _url);
	            //publishMer.set("dianzhao", _url);
	            publishMer.set("visible", false);
	            publishMer.save(null, {
	                success: function(publish) {
	                    response.success("商家登记成功，我们会在2个工作日内完成审核！");
	                },
	                error: function(publish, error) {
	                    response.error("保存失败(" + error.code + ")"); 
	                }
	            });        
	//        },
	//        function(error) {
	//            response.error("图片上传失败！(" + error.code + ")"); 
	//    });        
	//}
	//else{
	//    response.error("图片文件名或图片数据不存在！"); 
	//}
});

AV.Cloud.define('publishAct', function(request, response) {
	var _fname,_base64, _tit,_tel,_addr,_kw,_con,_lat,_lng,_user,_url;
	
	//("fileName" in request.params) ? _fname = request.params.fileName : _fname = "";
	//("base64" in request.params) ? _base64 = request.params.base64 : _base64 = "";
	("title" in request.params) ? _tit = request.params.title : _tit = "";
	("phoneNumber" in request.params) ? _tel = request.params.phoneNumber : _tel = "";
	("address" in request.params) ? _addr = request.params.address : _addr = "";
	("keyword" in request.params) ? _kw = request.params.keyword : _kw = "";
	("content" in request.params) ? _con = request.params.content : _con = "";
	("lat" in request.params) ? _lat = request.params.lat : _lat = "";
	("lng" in request.params) ? _lng = request.params.lng : _lng = "";
	("publisher" in request.params) ? _user = request.params.publisher : _user = "";
	("picurl" in request.params) ? _url = request.params.picurl : _url = "";
	//if(_base64 && _fname){
	//    var imgFile = new AV.File(_fname, {base64:_base64});
	//    imgFile.save().then(
	//        function(theFile) {
	            var publishAct = new AV.Object("publishAct");
	            publishAct.set("title", _tit);
	            publishAct.set("phoneNumber", _tel);
	            publishAct.set("address", _addr);
	            publishAct.set("keyword", _kw);
	            publishAct.set("content", _con);
	            
	            if(_lat && _lng){
	                var _lat = Number(_lat);
	                var _lng = Number(_lng);
	               
	                var point = new AV.GeoPoint({latitude: _lat, longitude: _lng});
	                if(point){
	                    publishAct.set("point", point);
	                }
	            }
	            
	            if(_user){
	                var user = new AV.User();
	                user.id = _user;
	                publishAct.set("publisher", user);
	            }
	            publishAct.set("picurl",_url);
	            publishAct.save(null, {
	                success: function(publish) {
	                    response.success("活动发布成功，我们会在1个工作日内完成审核！");
	                },
	                error: function(publish, error) {
	                    response.error("保存失败(" + error.code + ")"); 
	                }
	            });        
	//        },
	//        function(error) {
	//            response.error("图片上传失败！(" + error.code + ")"); 
	//    });        
	//}
	//else{
	//    response.error("图片文件名或图片数据不存在！"); 
	//}
});


//==============================================================================================================
AV.Cloud.define('winSearchMer', function(request, response) {
	var _val,_area,_cate,_limit,_skip;
	("value" in request.params) ? _val = request.params.value : _val = "";
	("limit" in request.params) ? _limit = Number(request.params.limit) : _limit = 20;
	("skip" in request.params) ? _skip = Number(request.params.skip) : _skip = 0;
	("area" in request.params) ? _area = request.params.area : _area = "";
	("category" in request.params) ? _cate = request.params.category : _cate = "";
	
	
	if(_cate){
		var queryCateID = new AV.Query("category");
		queryCateID.equalTo("objectId", _cate);
		var queryCatePID = new AV.Query("category");//All
		queryCatePID.equalTo("pId", _cate);	
		var queryCate = AV.Query.or(queryCateID, queryCatePID);
	}
	
	if(_area){
		var queryAreaID = new AV.Query("area");
		queryAreaID.equalTo("objectId", _area);
		var queryAreaPID = new AV.Query("area");//All
		queryAreaPID.equalTo("pId", _area);	
		var queryArea = AV.Query.or(queryAreaID, queryAreaPID);	
	} 
	
	if(_val){
	    var queryTitle = new AV.Query("merchants");
	    queryTitle.contains("title", _val);
	    var queryAddress = new AV.Query("merchants");
	    queryAddress.contains("address", _val);	
	    var queryA = AV.Query.or(queryAddress, queryTitle);
	    var queryPhoneNumber = new AV.Query("merchants");
	    queryPhoneNumber.contains("phoneNumber", _val);	
	    var queryB = AV.Query.or(queryPhoneNumber, queryA);
	    
	    var queryKeyword = new AV.Query("merchants");
	    queryKeyword.contains("keyword", _val);	
	    var query = AV.Query.or(queryB, queryKeyword);
	}
	else{
	    var query = new AV.Query("merchants");    
	}
	
	query.select("title","area","category","pic","point","address","phoneNumber",
	    "keyword","content","visible","sort","light");
	query.include("area");
	query.include("category");
	if(_cate){query.matchesQuery("category", queryCate);}
	if(_area){query.matchesQuery("area", queryArea);}
	query.descending("updatedAt");
	query.limit(_limit);
	query.skip(_skip);	
	query.find({
		success: function(results) {
		    if(results.length>0) {   
	
		        var datas = [];
		        for(var i = 0; i < results.length; i++){
		            var obj = results[i];
		            var pic = obj.get("pic");
		            if(pic){
		                _pic = {
		                   id: pic.id,
		                   url: pic._url || ""
		                   //name: pic._name
		                }
		            }else{
		                _pic = {
		                   id: "",
		                   url: ""
		                  // name: ""
		                }
		            }
		            
		            var area = obj.get("area");
		            if(area){
		                _area = {
		                    objectId:area.id,
		                    title:area.get("title") || ""
		                }
		            }else{
		                _area = {
		                    objectId:"",
		                    title:""
		                }
		            }
	                var cate = obj.get("category");
	                if(cate){
	                    _cate = {
		                    objectId:cate.id,
		                    title:cate.get("title") || ""
		                }
	                }else{
	                    _cate =  {
		                    objectId:"",
		                    title:""
		                }
	                }
	                
	                var point = obj.get("point");
	                var _poi = {
	                    lat :point.latitude,
	                    lng :point.longitude
	                }
	    	        var ret = {
	    	            objectId : obj.id,
	    	            createdAt : obj.createdAt,
	    	            updatedAt : obj.updatedAt,
	    	            title : obj.get("title") || "",
	    	            pic : _pic,
	    	            area : _area,
	    	            category : _cate,
	    	            address : obj.get("address") || "",
	    	            point : _poi,
	    	            phoneNumber : obj.get("phoneNumber") || "",
	    	            keyword : obj.get("keyword") || "",
	    	            content : obj.get("content") || "",
	    	            visible : obj.get("visible") || false,
	    	            light : obj.get("light") || false,
	    	            sort : obj.get("sort"),
	    	        }
		            datas.push(ret);
		        }
		        response.success(datas);
		    }
		    else{
		        response.success([]);
		    }
		},
	    error: function(error) {
	        response.error(JSON.stringify(error));
	    }
	});

});

AV.Cloud.define('winUpdateMer', function(request, response) {
var  _id,_tit,_tel,_addr,_kw,_lat,_lng,_fileId,_visible,_light,_con,_area,_cate;

("id" in request.params) ? _id = request.params.id : _id = "-1";
("title" in request.params) ? _tit = request.params.title : _tit = "-1";
("phoneNumber" in request.params) ? _tel = request.params.phoneNumber : _tel = "-1";
("address" in request.params) ? _addr = request.params.address : _addr = "-1";
("keyword" in request.params) ? _kw = request.params.keyword : _kw = "-1";
("lat" in request.params) ? _lat = request.params.lat : _lat = "-1";
("lng" in request.params) ? _lng = request.params.lng : _lng = "-1";
("visible" in request.params) ? _visible = request.params.visible : _visible = "-1";
("light" in request.params) ? _light = request.params.light : _light = "-1";
("content" in request.params) ? _con = request.params.content : _con = "-1";
("area" in request.params) ? _area = request.params.area : _area = "-1";
("category" in request.params) ? _cate = request.params.category : _cate = "-1";
("fileId" in request.params) ? _fileId = request.params.fileId : _fileId = "-1";

var _date = new Date();
var _res = {
    createdAt:_date,
    updatedAt:_date,
    result:0
}
if(_id!=='-1'){

    var merchants = AV.Object.extend("merchants");
    var query = new AV.Query(merchants);
    query.get(_id, {
        success: function(merchant){
            if(_tit!=='-1'){
                merchant.set("title", _tit);
            }
            if(_tel!=='-1'){
                merchant.set("phoneNumber", _tel);
            }
            if(_addr!=='-1'){
                merchant.set("address", _addr);
            }
            if(_kw!=='-1'){
                merchant.set("keyword", _kw);
            }
            if((_lat!=='-1') &&(_lng!=='-1')){
                var point = new AV.GeoPoint({latitude: Number(_lat), longitude: Number(_lng)});
                if(point){
                    merchant.set("point", point);
                }
            }
            if(_visible!=='-1'){
                merchant.set("visible", _visible);
            }
            if(_light!=='-1'){
                merchant.set("light", _light);
            }
            if(_con!=='-1'){
                merchant.set("content", _con);
            } 
            
            if(_area!=='-1'){
                var area =  AV.Object.createWithoutData("area", _area);
                merchant.set("area", area);
            }
            if(_cate!=='-1'){
                var category =  AV.Object.createWithoutData("category", _cate);
                merchant.set("category", category);
            } 
            if(_fileId!=='-1'){
                var file =  AV.Object.createWithoutData("_File", _fileId);
                merchant.set("pic", file);
            }            
            merchant.save(null, {
                success: function(ret) {
                    _res['result'] = 1;
                    response.success([_res]);
                },
                error: function(object, error) {
                    _res['result'] = -1;
                    response.success([_res]);
                }                
            });
        },
        error: function(object, error) {
            _res['result'] = -2;
            response.success([_res]);        
        }
    });
}
else{
    _res['result'] = -3;
    response.success([_res]);    
}

});

AV.Cloud.define('winCreateMer', function(request, response) {
var  _id,_tit,_tel,_addr,_kw,_lat,_lng,_url,_visible,_light,_con,_area,_cate,_fileId;

("id" in request.params) ? _id = request.params.id : _id = "-1";
("title" in request.params) ? _tit = request.params.title : _tit = "-1";
("phoneNumber" in request.params) ? _tel = request.params.phoneNumber : _tel = "-1";
("address" in request.params) ? _addr = request.params.address : _addr = "-1";
("keyword" in request.params) ? _kw = request.params.keyword : _kw = "-1";
("lat" in request.params) ? _lat = request.params.lat : _lat = "30.920000";
("lng" in request.params) ? _lng = request.params.lng : _lng = "113.920000";
("visible" in request.params) ? _visible = request.params.visible : _visible = null;
("light" in request.params) ? _light = request.params.light : _light = null;
("content" in request.params) ? _con = request.params.content : _con = "-1";
("area" in request.params) ? _area = request.params.area : _area = "-1";
("category" in request.params) ? _cate = request.params.category : _cate = "-1";
("fileId" in request.params) ? _fileId = request.params.fileId : _fileId = "-1";

var _date = new Date();
var _res = {
    createdAt:_date,
    updatedAt:_date,
    result:0,
    id:'0'
}
if(_id){

    var merchants = AV.Object.extend("merchants");
    var merchant = new merchants();
    if(_tit!=='-1'){
        merchant.set("title", _tit);
    }
    if(_tel!=='-1'){
        merchant.set("phoneNumber", _tel);
    }
    if(_addr!=='-1'){
        merchant.set("address", _addr);
    }
    if(_kw!=='-1'){
        merchant.set("keyword", _kw);
    }
    if((_lat!=='-1') &&(_lng!=='-1')){
        var point = new AV.GeoPoint({latitude: Number(_lat), longitude: Number(_lng)});
        if(point){
            merchant.set("point", point);
        }
    }
    if(_visible!==null){
        merchant.set("visible", _visible);
    }
    if(_light!==null){
        merchant.set("light", _light);
    }
    if(_con!=='-1'){
        merchant.set("content", _con);
    } 
    
    if(_area!=='-1'){
        var area =  AV.Object.createWithoutData("area", _area);
        merchant.set("area", area);
    }
    if(_cate!=='-1'){
        var category =  AV.Object.createWithoutData("category", _cate);
        merchant.set("category", category);
    }
    if(_fileId!=='-1'){
        var file =  AV.Object.createWithoutData("_File", _fileId);
        merchant.set("pic", file);
    }     
    merchant.save(null, {
        success: function(ret) {
            _res['result'] = 1;
            _res['id'] = ret.id;
            response.success([_res]);
        },
        error: function(object, error) {
            _res['result'] = -1;
            response.success([_res]);
        }                
    });
}
else{
    _res['result'] = -3;
    response.success([_res]);    
}

});

AV.Cloud.define('winSearchAct', function(request, response) {
var _val,_area,_cate,_limit,_skip;
("value" in request.params) ? _val = request.params.value : _val = "";
("limit" in request.params) ? _limit = Number(request.params.limit) : _limit = 20;
("skip" in request.params) ? _skip = Number(request.params.skip) : _skip = 0;
("area" in request.params) ? _area = request.params.area : _area = "";
("category" in request.params) ? _cate = request.params.category : _cate = "";

if(_cate){
	var queryCateID = new AV.Query("category");
	queryCateID.equalTo("objectId", _cate);
	var queryCatePID = new AV.Query("category");//All
	queryCatePID.equalTo("pId", _cate);	
	var queryCate = AV.Query.or(queryCateID, queryCatePID);
}

if(_area){
	var queryAreaID = new AV.Query("area");
	queryAreaID.equalTo("objectId", _area);
	var queryAreaPID = new AV.Query("area");//All
	queryAreaPID.equalTo("pId", _area);	
	var queryArea = AV.Query.or(queryAreaID, queryAreaPID);	
} 
       
var queryTitle = new AV.Query("activity");
queryTitle.contains("title", _val);
var queryAddr = new AV.Query("activity");
queryAddr.contains("addr", _val);	
var queryA = AV.Query.or(queryAddr, queryTitle);
var queryKeyword = new AV.Query("activity");
queryKeyword.contains("keyword", _val);		
var queryB = AV.Query.or(queryA, queryKeyword);
var querySubTitle = new AV.Query("activity");
querySubTitle.contains("subTitle", _val);		
var queryC = AV.Query.or(queryB, querySubTitle);	
var querySummary = new AV.Query("activity");
querySummary.contains("summary", _val);		
var query = AV.Query.or(queryC, querySummary);	

query.select(
   "title","subTitle","price","oriPrice","oriPriceTag","isPrice","addr","tel","content",
   "light","logo","pic","gp","area","category","visible","summary","keyword","sort","content");
query.include("area");
query.include("category");
if(_cate){query.matchesQuery("category", queryCate);}
if(_area){query.matchesQuery("area", queryArea);}   
query.ascending("sort");   
query.addDescending("createdAt"); 	  	
query.equalTo("isBanner", false);
//query.equalTo("merchant", queryMer);
query.limit(_limit);
query.skip(_skip);	
query.find({
	success: function(results) {
		if(results.length>0){

	        var datas = [];		    
		    for (var i = 0; i < results.length; i++) {
		        var obj = results[i];
		        
                var pic = obj.get("pic");
                if(pic){    
	                _pic = {
	                   id: pic.id,
	                   url: pic._url || ""
	                }
		        }else{
	                _pic = {
	                   id: "",
	                   url: ""
	                }
		        }
		        
	            var area = obj.get("area");
	            if(area){
	                _area = {
	                    objectId:area.id,
	                    title:area.get("title") || ""
	                }
	            }else{
	                _area = {
	                    objectId:"",
	                    title:""
	                }
	            }
	            
                var cate = obj.get("category");
                if(cate){
                    _cate = {
	                    objectId:cate.id,
	                    title:cate.get("title") || ""
	                }
                }else{
                    _cate =  {
	                    objectId:"",
	                    title:""
	                }
                }		        
                var point = obj.get("gp");
                if(point){
                    _poi = {
                        lat :point.latitude,
                        lng :point.longitude
                    }	
                }else{
                    _poi = {
                        lat :0,
                        lng :0
                    }                    
                }
    	        var ret = {
    	            objectId : obj.id,
    	            createdAt : obj.createdAt,
    	            updatedAt : obj.updatedAt,
    	            title : obj.get("title") || "",
    	            subTitle : obj.get("subTitle") || "",
    	            price:obj.get("price"),
    	            oriPrice:obj.get("oriPrice"),
    	            oriPriceTag:obj.get("oriPriceTag") || "",
    	            isPrice:obj.get("isPrice"),
    	            logo:obj.get("logo") || "",
    	            summary : obj.get("summary") || "",
    	            address : obj.get("addr") || "",
    	            phoneNumber : obj.get("tel") || "",
    	            keyword : obj.get("keyword") || "",
    	            content : obj.get("content") || "",
    	            visible : obj.get("visible") || false,
    	            light : obj.get("light") || false,
    	            sort : obj.get("sort"),    	            
    	            pic : _pic,
    	            area : _area,
    	            category : _cate,
    	            point : _poi
    	        }
	            datas.push(ret);				
		    }
		    response.success(datas);
		}
	    else{
	        response.success([]);
	    }		
	},
    error: function(error) {
        response.error(error);
    }
});
});

AV.Cloud.define('winUpdateAct', function(request, response) {
var  _id,_tit,_tel,_addr,_kw,_lat,_lng,_fileId,_visible,_light,_con,_area,_cate,_sub,_summ,_logo;

("id" in request.params) ? _id = request.params.id : _id = "-1";
("title" in request.params) ? _tit = request.params.title : _tit = "-1";
("phoneNumber" in request.params) ? _tel = request.params.phoneNumber : _tel = "-1";
("address" in request.params) ? _addr = request.params.address : _addr = "-1";
("keyword" in request.params) ? _kw = request.params.keyword : _kw = "-1";
("lat" in request.params) ? _lat = request.params.lat : _lat = "-1";
("lng" in request.params) ? _lng = request.params.lng : _lng = "-1";
("visible" in request.params) ? _visible = request.params.visible : _visible = "-1";
("light" in request.params) ? _light = request.params.light : _light = "-1";
("content" in request.params) ? _con = request.params.content : _con = "-1";
("area" in request.params) ? _area = request.params.area : _area = "-1";
("category" in request.params) ? _cate = request.params.category : _cate = "-1";
("fileId" in request.params) ? _fileId = request.params.fileId : _fileId = "-1";
("subTitle" in request.params) ? _sub = request.params.subTitle : _sub = "-1";
("summary" in request.params) ? _summ = request.params.summary : _summ = "-1";
("logo" in request.params) ? _logo = request.params.logo : _logo = "-1";

var _date = new Date();
var _res = {
    createdAt:_date,
    updatedAt:_date,
    result:0
}
if(_id!=='-1'){

    var Activity = AV.Object.extend("activity");
    var query = new AV.Query(Activity);
    query.get(_id, {
        success: function(activity){
            if(_tit!=='-1'){
                activity.set("title", _tit);
            }
            if(_sub!=='-1'){
                activity.set("subTitle", _sub);
            }      
            if(_summ!=='-1'){
                activity.set("summary", _summ);
            }               
            if(_tel!=='-1'){
                activity.set("tel", _tel);
            }
            if(_addr!=='-1'){
                activity.set("addr", _addr);
            }
            if(_kw!=='-1'){
                activity.set("keyword", _kw);
            }
            if(_logo!=='-1'){
                activity.set("logo", _logo);
            }            
            if((_lat!=='-1') &&(_lng!=='-1')){
                var point = new AV.GeoPoint({latitude: Number(_lat), longitude: Number(_lng)});
                if(point){
                    activity.set("gp", point);
                }
            }
            if(_visible!=='-1'){
                activity.set("visible", _visible);
            }
            if(_light!=='-1'){
                activity.set("light", _light);
            }
            if(_con!=='-1'){
                activity.set("content", _con);
            } 
            
            if(_area!=='-1'){
                var area =  AV.Object.createWithoutData("area", _area);
                activity.set("area", area);
            }
            if(_cate!=='-1'){
                var category =  AV.Object.createWithoutData("category", _cate);
                activity.set("category", category);
            } 
            if(_fileId!=='-1'){
                var file =  AV.Object.createWithoutData("_File", _fileId);
                activity.set("pic", file);
            }            
            activity.save(null, {
                success: function(ret) {
                    _res['result'] = 1;
                    response.success([_res]);
                },
                error: function(object, error) {
                    _res['result'] = -1;
                    response.success([_res]);
                }                
            });
        },
        error: function(object, error) {
            _res['result'] = -2;
            response.success([_res]);        
        }
    });
}
else{
    _res['result'] = -3;
    response.success([_res]);    
}

});

AV.Cloud.define('winUpdateAct', function(request, response) {
var  _id,_tit,_tel,_addr,_kw,_lat,_lng,_fileId,_visible,_light,_con,_area,_cate,_sub,_summ,_logo;

("id" in request.params) ? _id = request.params.id : _id = "-1";
("title" in request.params) ? _tit = request.params.title : _tit = "-1";
("phoneNumber" in request.params) ? _tel = request.params.phoneNumber : _tel = "-1";
("address" in request.params) ? _addr = request.params.address : _addr = "-1";
("keyword" in request.params) ? _kw = request.params.keyword : _kw = "-1";
("lat" in request.params) ? _lat = request.params.lat : _lat = "-1";
("lng" in request.params) ? _lng = request.params.lng : _lng = "-1";
("visible" in request.params) ? _visible = request.params.visible : _visible = "-1";
("light" in request.params) ? _light = request.params.light : _light = "-1";
("content" in request.params) ? _con = request.params.content : _con = "-1";
("area" in request.params) ? _area = request.params.area : _area = "-1";
("category" in request.params) ? _cate = request.params.category : _cate = "-1";
("fileId" in request.params) ? _fileId = request.params.fileId : _fileId = "-1";
("subTitle" in request.params) ? _sub = request.params.subTitle : _sub = "-1";
("summary" in request.params) ? _summ = request.params.summary : _summ = "-1";
("logo" in request.params) ? _logo = request.params.logo : _logo = "-1";

var _date = new Date();
var _res = {
    createdAt:_date,
    updatedAt:_date,
    result:0
}
if(_id!=='-1'){

    var Activity = AV.Object.extend("activity");
    var query = new AV.Query(Activity);
    query.get(_id, {
        success: function(activity){
            if(_tit!=='-1'){
                activity.set("title", _tit);
            }
            if(_sub!=='-1'){
                activity.set("subTitle", _sub);
            }      
            if(_summ!=='-1'){
                activity.set("summary", _summ);
            }               
            if(_tel!=='-1'){
                activity.set("tel", _tel);
            }
            if(_addr!=='-1'){
                activity.set("addr", _addr);
            }
            if(_kw!=='-1'){
                activity.set("keyword", _kw);
            }
            if(_logo!=='-1'){
                activity.set("logo", _logo);
            }            
            if((_lat!=='-1') &&(_lng!=='-1')){
                var point = new AV.GeoPoint({latitude: Number(_lat), longitude: Number(_lng)});
                if(point){
                    activity.set("gp", point);
                }
            }
            if(_visible!=='-1'){
                activity.set("visible", _visible);
            }
            if(_light!=='-1'){
                activity.set("light", _light);
            }
            if(_con!=='-1'){
                activity.set("content", _con);
            } 
            
            if(_area!=='-1'){
                var area =  AV.Object.createWithoutData("area", _area);
                activity.set("area", area);
            }
            if(_cate!=='-1'){
                var category =  AV.Object.createWithoutData("category", _cate);
                activity.set("category", category);
            } 
            if(_fileId!=='-1'){
                var file =  AV.Object.createWithoutData("_File", _fileId);
                activity.set("pic", file);
            }            
            activity.save(null, {
                success: function(ret) {
                    _res['result'] = 1;
                    response.success([_res]);
                },
                error: function(object, error) {
                    _res['result'] = -1;
                    response.success([_res]);
                }                
            });
        },
        error: function(object, error) {
            _res['result'] = -2;
            response.success([_res]);        
        }
    });
}
else{
    _res['result'] = -3;
    response.success([_res]);    
}

});

AV.Cloud.define('winCreateAct', function(request, response) {
var  _id,_tit,_tel,_addr,_kw,_lat,_lng,_url,_visible,_light,_con,_area,_cate,_fileId,_sub,_summ,_logo;

("id" in request.params) ? _id = request.params.id : _id = "-1";
("title" in request.params) ? _tit = request.params.title : _tit = "-1";
("phoneNumber" in request.params) ? _tel = request.params.phoneNumber : _tel = "-1";
("address" in request.params) ? _addr = request.params.address : _addr = "-1";
("keyword" in request.params) ? _kw = request.params.keyword : _kw = "-1";
("lat" in request.params) ? _lat = request.params.lat : _lat = "30.920000";
("lng" in request.params) ? _lng = request.params.lng : _lng = "113.920000";
("visible" in request.params) ? _visible = request.params.visible : _visible = '-1';
("light" in request.params) ? _light = request.params.light : _light = '-1';
("content" in request.params) ? _con = request.params.content : _con = "-1";
("area" in request.params) ? _area = request.params.area : _area = "-1";
("category" in request.params) ? _cate = request.params.category : _cate = "-1";
("fileId" in request.params) ? _fileId = request.params.fileId : _fileId = "-1";
("subTitle" in request.params) ? _sub = request.params.subTitle : _sub = "-1";
("summary" in request.params) ? _summ = request.params.summary : _summ = "-1";
("logo" in request.params) ? _logo = request.params.logo : _logo = "-1";

var _date = new Date();
var _res = {
    createdAt:_date,
    updatedAt:_date,
    result:0,
    id:'0'
}
if(_id){

    var Activity = AV.Object.extend("activity");
    var activity = new Activity();
    if(_tit!=='-1'){
        activity.set("title", _tit);
    }
    if(_sub!=='-1'){
        activity.set("subTitle", _sub);
    }      
    if(_summ!=='-1'){
        activity.set("summary", _summ);
    }
    if(_tel!=='-1'){
        activity.set("tel", _tel);
    }
    if(_addr!=='-1'){
        activity.set("addr", _addr);
    }
    if(_kw!=='-1'){
        activity.set("keyword", _kw);
    }
    if(_logo!=='-1'){
        activity.set("logo", _logo);
    }    
    if((_lat!=='-1') &&(_lng!=='-1')){
        var point = new AV.GeoPoint({latitude: Number(_lat), longitude: Number(_lng)});
        if(point){
            activity.set("gp", point);
        }
    }
    if(_visible!=='-1'){
        activity.set("visible", _visible);
    }
    if(_light!=='-1'){
        activity.set("light", _light);
    }
    if(_con!=='-1'){
        activity.set("content", _con);
    } 
    
    if(_area!=='-1'){
        var area =  AV.Object.createWithoutData("area", _area);
        activity.set("area", area);
    }
    if(_cate!=='-1'){
        var category =  AV.Object.createWithoutData("category", _cate);
        activity.set("category", category);
    }
    if(_fileId!=='-1'){
        var file =  AV.Object.createWithoutData("_File", _fileId);
        activity.set("pic", file);
    }     
    activity.save(null, {
        success: function(ret) {
            _res['result'] = 1;
            _res['id'] = ret.id;
            response.success([_res]);
        },
        error: function(object, error) {
            _res['result'] = -1;
            response.success([_res]);
        }                
    });
}
else{
    _res['result'] = -3;
    response.success([_res]);    
}

});

AV.Cloud.define('winSearchFilms', function(request, response) {
	var _val,_area,_cate,_limit,_skip;
	
	("value" in request.params) ? _val = request.params.value : _val = "";
	("limit" in request.params) ? _limit = Number(request.params.limit) : _limit = 20;
	("skip" in request.params) ? _skip = Number(request.params.skip) : _skip = 0;
	
	var query = new AV.Query("films");
	if(_val){
	    query.contains("title", _val);
	}
	query.descending("createdAt");
	query.limit(_limit);
	query.skip(_skip);	
	query.find({
		success: function(results) {
		    
		    if(results.length>0) { 
		        var datas = [];
		        for(var i = 0; i < results.length; i++){
	                var obj = results[i];
	                var pic = obj.get("pic");
	                if(pic){
	                    _pic = {
	                       id: pic.id,
	                       url: pic._url || ""
	                       //name: pic._name
	                    }
	                }else{
	                    _pic = {
	                       id: "",
	                       url: ""
	                      // name: ""
	                    }
	                }
	                var _per = arrayToString(obj.get("performer"),'/');
	                var _dir = arrayToString(obj.get("director"),'/');
	                var _typ = arrayToString(obj.get("type"),'/');
	                var _lang = arrayToString(obj.get("language"),'/');
	                var ret = {
	    	            objectId : obj.id,
	    	            createdAt : obj.createdAt,
	    	            updatedAt : obj.updatedAt, 
	    	            title : obj.get("title") || "",
	    	            director : _dir,
	    	            performer : _per,
	                    type : _typ,
	                    language : _lang,
	                    releaseDate : obj.get("releaseDate"),
	                    runtime : obj.get("runtime") || 0,
	                    synopsis : obj.get("synopsis") || "",
	    	            pic : _pic,    	            
	                }
	                datas.push(ret);
		        }
	            response.success(datas);
	            
		    }
		},
	    error: function(error) {
	        response.error(JSON.stringify(error));
	    }
	});
});