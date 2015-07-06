// Copyright (C) 2015 Hola. Licensed under the GPLv3
'use strict'; /*jslint node:true*/
var crypto = require('crypto');
var rimraf = require('rimraf');
var path = require('path');
var fs = require('fs');
var E = exports;
E.is_win = /^win/.test(process.platform);
E.read_buf_size = 8192;

function check_file(dst, opt){
    opt = opt||{};
    if (opt.mkdirp)
        E.mkdirp_file(dst);
    if (opt.unlink)
        E.unlink(dst);
}

E.read = function(filename, opt){
    if (opt===undefined)
        opt = 'utf8';
    return fs.readFileSync(filename, opt);
};
E.read_cb = function(filename, offset, length, pos, cb){
    var res, fd, buf;
    fd = fs.openSync(filename, 'r');
    buf = new Buffer(E.read_buf_size);
    try {
        while ((res = fs.readSync(fd, buf, 0, length, pos)))
        {
            if (cb(buf, res, pos))
                return;
            pos += res;
        }
    } finally { fs.closeSync(fd); }
};
E.read_line = function(filename){
    var ret = '';
    var code = 10 // \n
    E.read_cb(filename, 0, E.read_buf_size, 0, function(buf, read){
        var idx, size = Math.min(buf.length, read);
        for (idx=0; idx<size && buf[idx]!=code; idx++);
        ret += buf.slice(0, Math.min(idx, size));
        return idx<size;
    });
    // strip \r symbols on non-unix endlines
    if (ret[ret.length-1]=='\r')
        return ret.substr(0, ret.length-1);
    return ret;
};
E.read_lines = function(filename){
    var ret = E.read(filename).split(/\r?\n/);
    if (ret[ret.length-1]==='')
        ret.pop();
    return ret;
};
E.fread = function(fd, start){
    var buf, res, ret = '';
    start = start||0;
    buf = new Buffer(E.read_buf_size);
    // XXX: support for size
    while ((res = fs.readSync(fd, buf, 0, E.read_buf_size, start)))
    {
        ret += buf.slice(0, res);
        start += res;
    }
    return ret;
};
E.write = function(file, data, opt){
    opt = opt||{};
    check_file(file, opt);
    fs.writeFileSync(file, data, opt);
    return 0;
};
E.write_lines = function(file, data, opt){
    data = Array.isArray(data) ?
        (data.length ? data.join('\n')+'\n' : '') : ''+data+'\n';
    return E.write(file, data, opt);
};
E.append = function(file, data, opt){
    opt = opt||{};
    check_file(file, opt);
    fs.appendFileSync(file, data, opt);
    return 0;
};
E.tail = function(file, count){
    var fd, ret = '', start;
    var stat = fs.statSync(file);
    count = count||E.read_buf_size;
    start = stat.size-count;
    if (start<0)
        start = 0;
    fd = fs.openSync(file, 'r');
    try { ret = E.fread(fd, start); }
    finally { fs.closeSync(fd); }
    return ret;
};
E._mkdirp = function(p, mode, made){
    if (mode===undefined)
        mode = parseInt('0777', 8) & ~(process.umask&&process.umask());
    if (typeof mode==='string')
        mode = parseInt(mode, 8);
    made = made||null;
    p = path.resolve(p);
    var paths = [];
    while (p && !E.exists(p))
    {
        paths.unshift(p);
        p = path.dirname(p);
    }
    for (var i=0; i<paths.length; i++)
    {
        fs.mkdirSync(paths[i], mode);
        made = made||paths[i];
    }
    return made||p;
};
E.mkdirp = function(p, mode){
    if (mode===undefined || !process.umask)
        return E._mkdirp(p);
    var oldmask = process.umask(0);
    try { return E._mkdirp(p, mode); }
    finally { process.umask(oldmask); }
};
E.mkdirp_file = function(file){
    E.mkdirp(path.dirname(file));
    return file;
};
E.rm_rf = rimraf.sync;
E.unlink = function(path){
    try { fs.unlinkSync(path); }
    catch(e){ return e.code; }
};
E.touch = function(path){
    var fd = fs.openSync(path, 'a');
    fs.closeSync(fd);
};
E.exists = function(path){
    return fs.existsSync(path); };
E.is_file = function(path){
    var stat;
    try { stat = fs.statSync(path); }
    catch(e){ return false; }
    return stat.isFile();
};
E.is_dir = function(path){
    var stat;
    try { stat = fs.statSync(path); }
    catch(e){ return false; }
    return stat.isDirectory();
};
E._copy = function(src, dst, opt){
    var fdw, stat, mode;
    opt = opt||{};
    // XXX: check if mode of dst file is correct after umask
    stat = fs.statSync(src);
    if (E.is_dir(dst)||dst[dst.length-1]=='/')
        dst = dst+'/'+path.basename(src);
    check_file(dst, opt);
    mode = 'mode' in opt ? opt.mode : stat.mode & parseInt('0777', 8);
    fdw = fs.openSync(dst, 'w', mode);
    try {
        E.read_cb(src, 0, E.read_buf_size, 0, function(buf, read){
            fs.writeSync(fdw, buf, 0, read); });
    }
    finally { fs.closeSync(fdw); }
    return 0;
};
E._copy_dir = function(src, dst, opt){
    var files = fs.readdirSync(src);
    for (var f=0; f<files.length; f++)
    {
        var res = E.copy(src+'/'+files[f], dst+'/'+files[f], opt);
        if (res)
            return res;
    }
    return 0;
};
E.copy = function(src, dst, opt){
    src = E.normalize(src);
    dst = E.normalize(dst);
    if (E.is_dir(src))
        return E._copy_dir(src, dst, opt);
    return E._copy(src, dst, opt);
};
E.link = function(src, dst, opt){
    opt = opt||{};
    src = E.normalize(src);
    dst = E.normalize(dst);
    check_file(dst, opt);
    try { fs.linkSync(src, dst); }
    catch(e)
    {
        if (opt.no_copy)
            return e.code;
        return E.copy(src, dst, opt);
    }
    return 0;
};
E.symlink = function(src, dst, opt){
    if (E.is_win)
        return E.link(src, dst, opt);
    src = E.normalize(src);
    dst = E.normalize(dst);
    check_file(dst, opt);
    var src_abs = fs.realpathSync(src);
    fs.symlinkSync(src_abs, dst);
    return 0;
};
E.hashsum = function(filename, type){
    var hash = crypto.createHash(type||'md5');
    E.read_cb(filename, 0, E.read_buf_size, 0, function(buf, read){
        hash.update(buf.slice(0, read)); });
    return hash.digest('hex');
};

if (E.is_win)
{
    E.cygwin_root = E.is_dir('C:/cygwin') ? 'C:/cygwin' :
        E.is_dir('D:/cygwin') ? 'D:/cygwin' : null;
}
E.cyg2unix = function(path){
    if (!E.is_win)
        return path;
    // /cygdrive/X/yyy --> X:/yyy
    path = path.replace(/^\/cygdrive\/(.)(\/(.*))?$/, "$1:/$3");
    // /usr/lib --> c:/cygwin/lib
    path = path.replace(/^\/usr\/lib\/(.*)?$/, E.cygwin_root+"/lib/$1");
    // /usr/bin --> c:/cygwin/bin
    path = path.replace(/^\/usr\/bin\/(.*)?$/, E.cygwin_root+"/bin/$1");
    // /xxx --> c:/cygwin/xxx
    path = path.replace(/^\//, E.cygwin_root.toLowerCase()+'/');
    return path;
};
E.unix2win = function(path){
    if (!E.is_win)
        return path;
    // c:/xxx -> C:/xxx
    path = path.replace(/^[cd]:/, function(s){ return s.toUpperCase(); });
    // C:/xxx/yyy -> C:\xxx\yyy
    path = path.replace(/\//g, '\\');
    return path;
};
E.win2unix = function(path, force)
{
    if (!force && !E.is_win)
        return path;
    // C:\xxx\yyy --> C:/xxx/yyy
    path = path.replace(/\\/g, '/');
    // C:/ --> c:/
    path = path.replace(/^[cd]:/i, function(s){ return s.toLowerCase(); });
    return path;
};
E.win2cyg = function(path){
    if (!E.is_win)
        return path;
    path = E.win2unix(path);
    var escaped_root = E.cygwin_root.replace(/([\?\\\/\[\]+*])/g, '\\$1');
    path = path.replace(new RegExp("^"+escaped_root+"/?", "i"), '/');
    path = path.replace(/^[cd]:/i, function(s){
        return "/cygdrive/"+s[0].toLowerCase(); });
    return path;
};
E.is_absolute = function(path){
    return /^(\/|([cd]:))/i.test(path); };
E.absolutize = function(p, d1, d2){
    if (!p||E.is_absolute(p))
        return p;
    if (d2&&E.exists(d2+'/'+p))
        return d2+'/'+p;
    return d1+'/'+p;
};
E.normalize = function(p){
    return E.cyg2unix(E.win2unix(path.normalize(p))); };
