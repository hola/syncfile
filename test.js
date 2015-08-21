// Copyright (C) 2015 Hola. Licensed under the GPLv3
'use strict'; /*jslint node:true, mocha:true*/
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var file = require('./file.js');

describe('file', function(){
    var tmp_filename = 'test.tmp';
    beforeEach(file.unlink.bind(null, tmp_filename));
    afterEach(file.unlink.bind(null, tmp_filename));
    describe('throwing', function(){
    before(function(){ file = file._; });
    after(function(){ file = file.safe; });
    it('read', function(){
        var t = function(data, exp){
            file.write(tmp_filename, data);
            assert.deepEqual(file.read(tmp_filename), exp);
        };
        t('', '');
        t('a', 'a');
        t('ab\ncd\ne', 'ab\ncd\ne');
        assert.throws(file.read.bind(null, 'not_exist'), /ENOENT/);
    });
    it('read_cb', function(){
        var size = file.read_buf_size;
        var data = new Array(size*2+12);
        data = data.join('');
        file.write(tmp_filename, data);
        var t = function(data, read, pos, c){
            var count = 0, res = '';
            var func = function(buf, read, pos){
                count++;
                assert.equal(read[count], read);
                assert.equal(pos[count], pos);
                res += buf.slice(0, read);
                if (c && count>c)
                    return true;
            };
            assert(file.read_cb(tmp_filename, 0, size, 0, func));
            assert.equal(res, data);
        };
        t(data, [size, size, data.length-size*2], [0, size, size*2]);
        t(data.slice(0, size*2), [size, size], [0, size, size*2], 1);
        assert.throws(file.read_cb.bind(null, 'not_exists'), /ENOENT/);
    });
    it('read_line', function(){
        var t = function(data, exp){
            var prev = file.read_buf_size;
            file.read_buf_size = 5;
            file.write(tmp_filename, data);
            try { assert.equal(file.read_line(tmp_filename), exp); }
            finally { file.read_buf_size = prev; }
        };
        t('a', 'a');
        t('ab\ncd\ne', 'ab');
        t('ab\r\ncd\r\ne', 'ab');
        t('abcde\ncd\ne', 'abcde');
        t('abcdef\ncd\ne', 'abcdef');
        t('abcde', 'abcde');
        t('abcdef', 'abcdef');
        t('abcdef\n', 'abcdef');
        t('abcdef\r\n', 'abcdef');
        assert.throws(file.read_line.bind(null, 'not_exist'), /ENOENT/);
    });
    it('read_lines', function(){
        var t = function(data, exp){
            file.write(tmp_filename, data);
            assert.deepEqual(file.read_lines(tmp_filename), exp);
        };
        t('', []);
        t('a', ['a']);
        t('ab\ncd\ne', ['ab', 'cd', 'e']);
        t('ab\ncd\ne\n', ['ab', 'cd', 'e']);
        t('ab\ncd\ne\n\n', ['ab', 'cd', 'e', '']);
        t('ab\r\ncd\r\ne\n\n', ['ab', 'cd', 'e', '']);
        assert.throws(file.read_lines.bind(null, 'not_exist'), /ENOENT/);
    });
    it('fread', function(){
        var t = function(data, exp){
            file.write(tmp_filename, data);
            var fd = fs.openSync(tmp_filename, 'r');
            assert.deepEqual(file.fread(fd), exp);
            fs.close(fd);
        };
        t('', '');
        t('a', 'a');
        t('ab\ncd\ne', 'ab\ncd\ne');
        assert.throws(file.fread.bind(null, -1), /EBADF/);
    });
    it('write', function(){
        var t = function(data, exp){
            assert(file.write(tmp_filename, data));
            assert.deepEqual(file.read(tmp_filename), exp);
        };
        t('', '');
        t(1, '1');
        t(new Buffer([1, 2, 3]), '\u0001\u0002\u0003');
    });
    it('write_lines', function(){
        var t = function(data, exp){
            assert(file.write_lines(tmp_filename, data));
            assert.deepEqual(file.read(tmp_filename), exp);
        };
        t('', '\n');
        t(1, '1\n');
        t([], '');
        t(['abc'], 'abc\n');
        t(['abc', 'def'], 'abc\ndef\n');
    });
    it('append', function(){
        var expr = '';
        var t = function(data){
            expr += data;
            assert(file.append(tmp_filename, data));
            assert.deepEqual(file.read(tmp_filename), expr);
        };
        t('', '');
        t(1, '1');
        t('23\n', '123\n');
        t(new Buffer([1, 2, 3]), '123\n\u0001\u0002\u0003');
    });
    it('tail', function(){
        var t = function(data, count, exp){
            file.write(tmp_filename, data);
            assert.equal(file.tail(tmp_filename, count), exp);
        };
        t('abcd', 3, 'bcd');
        var ld = new Array(file.read_buf_size);
        ld = ld.join('abc');
        t(ld, null, ld.substr(ld.length-file.read_buf_size));
    });
    it('mkdirp', function(){
        var t = function(dir, mode, root){
            mode = mode||'0777';
            var made = file.mkdirp(dir, mode);
            assert(made);
            // must return first created dir
            assert(!dir.indexOf(made));
            var bits = parseInt(mode, 8);
            assert.equal(fs.statSync(dir).mode & bits, bits);
            file.rm_rf(made);
        };
        file.rm_rf('/tmp/mkdirp_test');
        t('/tmp/mkdirp_test', '0777');
        t('/tmp/mkdirp_test/test2/test3', '0755');
        t('/tmp/mkdirp_test/a/b/c/d/_/r/e/c/u/r/s/i/v/e/_/m/k/d/i/r/_'+
            '/f/a/i/l/e/d/_/w/i/t/h/_/t/h/i/s/');
        assert.throws(function(){
            var filename = '/tmp/mkdir_file';
            file.touch(filename);
            try { t(filename+'/cannot/create'); }
            catch (e){ throw e; }
            finally { file.unlink(filename); }
        }, /ENOTDIR/);
        assert.throws(t.bind(null, '/cannot/create'), /EACCES/);
    });
    it('unlink', function(){
        assert.throws(file.unlink.bind(null, '/this/file/does-not/exist'),
            /ENOENT/);
        file.write(tmp_filename, 'abc');
        assert(file.unlink(tmp_filename));
        assert.throws(file.unlink.bind(null, tmp_filename), /ENOENT/);
        // Unlink dir
        file.mkdirp('test_dir');
        assert.throws(file.unlink.bind(null, 'test_dir'), /EISDIR/);
        file.rm_rf('test_dir');
    });
    it('touch', function(){
        assert(file.touch(tmp_filename));
        assert(file.unlink(tmp_filename));
        assert.throws(file.touch.bind(null, '/this/file/does-not/exist'),
            /ENOENT/);
    });
    it('copy', function(){
        var cp = 'copy_file';
        var dcp = 'dst_file';
        file.safe.unlink(cp);
        file.safe.unlink(dcp);
        function t(src, dst, data, mode, opt){
            mode = mode||'0666';
            if (typeof data=='string')
                file.write(src, data, {mode: mode});
            try {
                assert(file.copy(src, dst, opt));
                if (file.is_dir(dst))
                    dst += '/'+path.basename(src);
                var statd = fs.statSync(dst);
                assert.equal(statd.mode & parseInt('0777', 8),
                    parseInt(mode, 8) & ~process.umask());
            }
            finally
            {
                file.safe.unlink(src);
                file.safe.unlink(dst);
            }
        }
        t(cp, dcp, '');
        t(cp, dcp, 'some data');
        t(cp, dcp, 'more\ndata\n');
        t(cp, dcp, 'data', '0777');
        assert.throws(file.copy.bind(null, '/file', dcp), /ENOENT/);
        assert.throws(t.bind(null, cp, '/file', 'wrong'), /EACCES/);
        var dcd = dcp+'_dir';
        file.rm_rf(dcd);
        assert.throws(t.bind(null, cp, dcd+'/file', 'data'), /ENOENT/);
        t(cp, dcd+'/file', 'data', 0, {mkdirp: 1});
        t(cp, dcd+'/', 'data');
        t(cp, dcd, 'data');
        t(cp, dcp, 'data', '0444', {mode: '444'});
        file.safe.unlink(cp);
        file.safe.unlink(dcp);
        file.rm_rf(dcd);
    });
    it('link', function(){
        var ls = 'link_src', ld = 'link_dst';
        file.safe.unlink(ls);
        file.safe.unlink(ld);
        file.rm_rf(ld+'d');
        var t = function(src, dst, opt){
            assert(file.link(src, dst, opt));
            assert(file.exists(dst));
            assert(file.is_file(dst));
        };
        file.write(ls, 'data');
        t(ls, ld);
        t(ls, ld+'d/dir/file', {mkdirp: 1});
        file.unlink(ls);
        file.unlink(ld);
        file.rm_rf(ld+'d');
    });
    it('symlink', function(){
        var ls = file.absolutize('slink_src', __dirname);
        var ld = file.absolutize('slink_dst', __dirname);
        file.safe.unlink(ls);
        file.safe.unlink(ld);
        file.rm_rf(ld+'d');
        var t = function(src, dst, opt){
            assert(file.symlink(src, dst, opt));
            var stat = fs.lstatSync(dst);
            assert(stat.isSymbolicLink());
            assert.equal(src, fs.readlinkSync(dst));
        };
        assert.throws(file.symlink.bind(null, ls, ld), /ENOENT/);
        file.write(ls, 'data');
        t(ls, ld);
        assert.throws(file.symlink.bind(null, ls, ld), /EEXIST/);
        t(ls, ld, {unlink: 1});
        assert.throws(file.symlink.bind(null, ls, ld+'d/dir/file'),
            /ENOENT/);
        t(ls, ld+'d/dir/file', {mkdirp: 1});
        file.rm_rf(ld+'d');
        file.unlink(ls);
        file.unlink(ld);
    });
    it('hashsum', function(){
        var f = 'hashsum_file';
        var t = function(d, r, t){
            file.write(f, d);
            assert.equal(file.hashsum(f, t), r);
        };
        t('data', '8d777f385d3dfec8815d20f7496026dc');
        t('data', '8d777f385d3dfec8815d20f7496026dc');
        var ld = new Array(file.read_buf_size*3);
        t(ld.join('1'), '0811769d134bdb1a36408c510d5e767a');
        t(ld.join('1'), '0811769d134bdb1a36408c510d5e767a');
        file.unlink(f);
    });
    }); // throwing
    describe('safe', function(){
    // null-returning
    ['read', 'read_line', 'read_lines', 'tail', 'hashsum'].forEach(
    function(method){
        it(method, function(){
            assert.equal(file[method]('not_exist'), null);
            assert.equal(file.errno, 'ENOENT');
        });
    });
    function mit(method, args, err){
        it(method, function(){
            assert(!file[method].apply(null, args));
            assert.equal(file.errno, err);
        });
    }
    var cc = '/cannot/create';
    mit('read_cb', [cc], 'ENOENT');
    mit('fread', [12345], 'EBADF');
    mit('write', [cc, 'noent'], 'ENOENT');
    mit('append', [cc, 'noent'], 'ENOENT');
    mit('mkdirp', [cc], 'EACCES');
    mit('unlink', [cc], 'ENOENT');
    mit('touch', [cc], 'ENOENT');
    }); // safe
    it('exists', function(){
        var t = function(_file, exp){
            assert.equal(file.exists(_file), exp); };
        t('.', true);
        t('..', true);
        t('does_not_exist', false);
        t('test.js', true);
        t('./test.js', true);
    });
    it('is_file', function(){
        var t = function(_file, exp){
            assert.equal(file.is_file(_file), exp); };
        t('.', false);
        t('..', false);
        t('does_not_exist', false);
        t('test.js', true);
        t('./test.js', true);
    });
    it('is_dir', function(){
        var t = function(dir, exp){
            assert.equal(file.is_dir(dir), exp); };
        t('.', true);
        t('..', true);
        t('does_not_exist', false);
        t('test.js', false);
        t('./test.js', false);
    });
    it('is_symlink', function(){
        var t = function(dir, exp){
            assert.equal(file.is_symlink(dir), exp); };
        t('.', false);
        t('does_not_exist', false);
            file.symlink('test.js', tmp_filename);
        t(tmp_filename, true);
    });
    it('is_absolute', function(){
        var t = function(s, r){ assert(file.is_absolute(s)==r); };
        t('/file', true);
        t('file/not/absolute', false);
        t('C:/dir', true);
        t('win\\like', false);
    });
    it('absolutize', function(){
        var t = function(s, d1, d2, r){
            assert(file.absolutize(s, d1, d2)==r); };
        t('/file', '/x', '', '/file');
        t('file', '/dir', '', '/dir/file');
        t('file', '/dir', '/', '/dir/file');
        var cp = '/tmp';
        var cpf = cp+'/'+tmp_filename;
        file.touch(cpf);
        t(tmp_filename, '/', cp, cpf);
        file.unlink(cpf);
    });
    it('normalize', function(){
        var t = function(p, r){
            assert(file.normalize(p)==r); };
        t('file', 'file');
        t('file/dir', 'file/dir');
        t('file//dir', 'file/dir');
        t('file///dir', 'file/dir');
        t('file/./dir', 'file/dir');
        t('./dir', 'dir');
        t('dir/./', 'dir/');
        t('dir/.', 'dir');
        t('pre/dir/../file', 'pre/file');
        t('dir/..', '.');
        t('../dir', '../dir');
    });
    describe('cygwin', function(){
        var is_win = file.is_win, root = file.cygwin_root;
        before(function(){
            file.is_win = true;
            file.cygwin_root = 'C:/cygwin';
        });
        after(function(){
            file.is_win = is_win;
            file.cygwin_root = root;
        });
        it('cyg2unix', function(){
            var t = function(path, exp){
                assert.equal(file.cyg2unix(path), exp); };
            t('file', 'file');
            t('dir/file', 'dir/file');
            t('c:/dir/file', 'c:/dir/file');
            t('/cygdrive/c/dir/file', 'c:/dir/file');
            t('/cygdrive/c', 'c:/');
            t('/dir', 'c:/cygwin/dir');
            t('/', 'c:/cygwin/');
        });
        it('unix2win', function(){
            var t = function(path, exp){
                assert.equal(file.unix2win(path), exp); };
            t('file', 'file');
            t('dir/file', 'dir\\file');
            t('c:/dir/file', 'C:\\dir\\file');
        });
        it('win2unix', function(){
            var t = function(path, exp){
                assert.equal(file.win2unix(path), exp); };
            t('file', 'file');
            t('dir\\file', 'dir/file');
            t('C:\\file', 'c:/file');
        });
        it('win2cyg', function(){
            var t = function(path, exp){
                assert.equal(file.win2cyg(path), exp); };
            t('C:\\file', '/cygdrive/c/file');
            t('C:\\cygwin\\usr', '/usr');
            t('C:/cygwin', '/');
            t('c:/cygwin/x', '/x');
            t('abC:/cygwinxx', 'abC:/cygwinxx');
        });
    });
});
