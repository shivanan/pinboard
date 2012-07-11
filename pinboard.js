/*
 * Pinboard Bookmarker
 * Copyright (c) 2010 Haran Shivanan <shivanan@statictype.org>
 * Licensed under the MIT License. See the LICENSE.txt file
 */
DB_VERSION = "1.0";
var Pinboard = function(user,password) {
        this.user = user;
        this.password = password;
}
Pinboard.prototype.getSuggestedTags = function(url,cb,err_cb) {
    var error_cb = function(xhr,status,err) {
            console.log('Error:' + status);
            if (!!err_cb) err_cb(status);
    }
    var success_cb = function(data,status) {
        console.log('Tags:',data.selectNodes);
        if (!!cb) cb(data);
    }
    var options = {
        'async': true
        ,'data': {
            'url':url
        }
        ,'error':error_cb
        ,'success':success_cb
        ,'url':'https://api.pinboard.in/v1/posts/suggest'
        ,"dataType":"xml"
        ,'timeout':7*1000
        ,'password':this.password
        ,'username':this.user
    }
    $.ajax(options);
}
Pinboard.prototype.getAllTags = function(cb,err_cb) {
    xmlLoad('https://api.pinboard.in/v1/tags/get',{},this.user,this.password,cb,err_cb);
}
function parseBookmarkXml(xml) {
    var bookmarks = [];
    $(xml).find('post').each(function(){
        var node = $(this);
        var bookmark = {
            'url':node.attr('href')
            ,'hash':node.attr('hash')
            ,'notes':node.attr('extended')
            ,'title':node.attr('description')
            ,'time':node.attr('time')
            ,'tags': node.attr('tag')
        };
        bookmarks.push(bookmark);
    });
    return bookmarks;
}
Pinboard.prototype.getRecentBookmarks = function(cb,err_cb) {
    var success = function(xml) {
        console.log('Got recent bookmarks',xml);
        var bookmarks = parseBookmarkXml(xml);
        if (!!cb) cb(bookmarks);
    }

    var failure = function(err) {
        console.error('Error getting recent bookmarks' , err);
        if (!!err_cb) err_cb(err);
    };
    xmlLoad('https://api.pinboard.in/v1/posts/recent',{'count':'100'},this.user,this.password,success,failure);
}
Pinboard.prototype.downloadAll = function(last,cb,err_cb) {
    var success = function(xml) {
        console.log('Got all bookmarks',xml);
        var t = $(xml).find('posts').attr('total');
        var total = 0;
        try { total = parseInt(t);} 
        catch (err) {
            console.log('Invalid total count',t);
        }
        var bookmarks = parseBookmarkXml(xml);
        if (!!cb) cb(total,bookmarks);
    }

    var failure = function(err) {
        console.error('Error getting all bookmarks' , err);
        if (!!err_cb) err_cb(err);
    };
    var args = {'results':'100'};
    if (!!last) args['start'] = last;
    xmlLoad('https://api.pinboard.in/v1/posts/all',args,this.user,this.password,success,failure,60*1000);
}
Pinboard.prototype.checkLogin = function(cb,err_cb) {
    var success = function(xml) {
        var last_time = $(xml).find('update').attr('time');
        cb({'time':last_time});
    };
    var failure = function(err) {
        console.error('Error in login',err);
        if (!!err_cb) err_cb(err);
    }
    xmlLoad('https://api.pinboard.in/v1/posts/update',{},this.user,this.password,success,failure,40*1000);
}
Pinboard.prototype.getUpdate = function(cb,err_cb) {
    var success = function(xml) {
        console.log('Got update',xml);
        var last_time = '';
        last_time = $(xml).find('update').attr('time');
        cb({'time':last_time});
    };
    var failure = function(err) {
        console.error('Error getting update',err);
        if (!!err_cb) err_cb(err);
    }
    xmlLoad('https://api.pinboard.in/v1/posts/update',{},this.user,this.password,success,failure);
}
Pinboard.prototype.addBookmark = function(url,desc,tags,notes,is_private,succ,fail) {

    var error_cb = function(xhr,sts,err) {
            console.log('Error:' + sts+":"+err);
            if (!!fail) fail(sts);
    };
    var success_cb = function(data,sts) {
            console.log('Success' + data + ":" + sts)
                if (!!succ) succ(data);
    };
    var data = {
        'url':url
            ,'description':desc
            ,'tags':tags
            ,'extended': notes
    };
    if (!!is_private) data['shared'] = 'no';
    var options = {
        'async': true
        ,'data': data
        ,'error':error_cb
        ,'password':this.password
        ,'username':this.user
        ,'success':success_cb
        ,'url':'https://api.pinboard.in/v1/posts/add'
        ,'timeout': 7*1000
    };
    $.ajax(options);
}
Pinboard.prototype.__createLocalStorageKey = function(key) {
    if (!this.user) return null;
    return this.user + ":" + key;
}
Pinboard.prototype.getLocalData = function(k) {
    var key = this.__createLocalStorageKey(k);
    if (!key) return null;
    return localStorage[key];
}
Pinboard.prototype.setLocalData = function(k,v) {
    var key = this.__createLocalStorageKey(k);
    if (!key) return false;
    localStorage[key] = v;
    return true;
}
Pinboard.prototype.dbErrorHandler = function(tx,err) {
    console.log('DB Error',err.code,err.message);
}
Pinboard.prototype.installDB = function(tx,done) {
    console.log('Installing db');
    tx.executeSql('drop table if exists Tags;',[],null,this.dbErrorHandler);
    tx.executeSql('drop table if exists Bookmarks;',[],null,this.dbErrorHandler);
    tx.executeSql('create table Tags(tag text not null, count int not null);',[],null,this.dbErrorHandler);
    tx.executeSql('create table Bookmarks(url text not null primary key on conflict replace,title text not null,tags text ,notes text,hash text,time text);',[],null,this.dbErrorHandler);
    if (!!done) done(db);
}
var DB_CACHE = {};
Pinboard.prototype.getDatabase = function(done) {
    if (!this.user) {
        console.error("Error getting db: No user")
        return;
    }

    if (!DB_CACHE[this.user]) {
        console.log('getting new db');
        DB_CACHE[this.user] =  window.openDatabase('pinboard_'+this.user,"",'Pinboard',1024*1024);
    }
    var that = this;
    var db = DB_CACHE[this.user];
    if (db.version != DB_VERSION) {
        console.log('Warning: DB Version Mismatch',db.version,DB_VERSION);
        db.changeVersion(db.version,DB_VERSION
                ,function(_db){that.installDB(_db);}
                ,that.dbErrorHandler
                ,function(_db) { done(db); }
                );
    } else {
        done(db);
    }
}
