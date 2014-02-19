function Qiniu(op) {
    if (!op.uptoken_url || !op.domain) {
        return false;
    }
    var option = {};

    var Error_Handler = op.init && op.init.Error;
    var FileUploaded_Handler = op.init && op.init.FileUploaded;

    op.init.Error = function() {};
    op.init.FileUploaded = function() {};

    var uptoken_url = op.uptoken_url;
    this.domain = op.domain;

    //Todo ie7 handler / parseJson bug;


    var ie = detectIEVersion();
    if (ie && ie <= 9 && op.chunk_size && op.runtimes.indexOf('flash') >= 0) {
        /*
        link: http://www.plupload.com/docs/Frequently-Asked-Questions#when-to-use-chunking-and-when-not
        when plupload chunk_size setting is't null ,it cause bug in ie8/9  which runs  flash runtimes (not support html5) .
        */
        op.chunk_size = 0;

    } else {
        var BLOCK_BITS = 20;
        var MAX_CHUNK_SIZE = 4 << BLOCK_BITS; //4M

        var chunk_size = plupload.parseSize(op.chunk_size);
        if (chunk_size > MAX_CHUNK_SIZE) {
            op.chunk_size = MAX_CHUNK_SIZE;
        }
        //qiniu service  max_chunk_size is 4m
        //reset chunk_size to max_chunk_size(4m) when chunk_size > 4m
    }


    var token = '';
    var ctx = '';

    plupload.extend(option, op, {
        url: 'http://up.qiniu.com',
        multipart_params: {
            token: ''
        }
    });

    var uploader = new plupload.Uploader(option);
    this.uploader = uploader;


    var getUpToken = function() {
        var ajax = createAjax();
        ajax.open('GET', uptoken_url, true);
        ajax.setRequestHeader("If-Modified-Since", "0");
        ajax.onreadystatechange = function() {
            if (ajax.readyState === 4 && ajax.status === 200) {
                var res = parseJSON(ajax.responseText);
                token = res.uptoken;
            }
        };
        ajax.send();
    };

    uploader.bind('Init', function(up, params) {
        getUpToken();
    });
    uploader.init();

    // uploader.Error_Handler = Error_Handler;
    // uploader.FileUploaded_Handler = FileUploaded_Handler;


    uploader.bind('FilesAdded', function(up, files) {
        if (up.getOption('auto_start')) {
            $.each(files, function(i, file) {
                up.start();
            });
        }
        up.refresh(); // Reposition Flash/Silverlight
    });

    uploader.bind('BeforeUpload', function(up, file) {

        ctx = '';

        function directUpload() {
            up.setOption({
                'url': 'http://up.qiniu.com/',
                'multipart': true,
                'chunk_size': undefined,
                'multipart_params': {
                    'token': token,
                    'key': file.name
                }
            });
        }
        var chunk_size = up.getOption('chunk_size');

        if (uploader.runtime === 'html5' && chunk_size) {
            if (file.size < chunk_size) {
                directUpload();
            } else {
                var blockSize = chunk_size;
                ctx = '';
                up.setOption({
                    'url': 'http://up.qiniu.com/mkblk/' + blockSize,
                    'multipart': false,
                    'chunk_size': chunk_size,
                    'headers': {
                        'Authorization': 'UpToken ' + token
                    },
                    'multipart_params': {}
                });
            }
        } else {
            directUpload();
        }
    });

    uploader.bind('ChunkUploaded', function(up, file, info) {
        var res = parseJSON(info.response);

        ctx = ctx ? ctx + ',' + res.ctx : res.ctx;
        var leftSize = info.total - info.offset;
        var chunk_size = up.getOption('chunk_size');
        if (leftSize < chunk_size) {
            up.setOption({
                'url': 'http://up.qiniu.com/mkblk/' + leftSize
            });
        }

    });

    uploader.bind('Error', (function(Error_Handler) {
        return function(up, err) {
            var errTip = '';
            var file = err.file;
            // console.log('file', file);
            if (file) {
                switch (err.code) {
                    case plupload.FAILED:
                        errTip = '上传失败。请稍后再试。';
                        break;
                    case plupload.FILE_SIZE_ERROR:
                        errTip = '浏览器最大可上传' + up.getOption('max_file_size') + '。更大文件请使用命令行工具。';
                        break;
                    case plupload.FILE_EXTENSION_ERROR:
                        errTip = '文件验证失败。请稍后重试。';
                        break;
                    case plupload.HTTP_ERROR:
                        switch (err.status) {
                            case 400:
                                errTip = "请求报文格式错误。";
                                break;
                            case 401:
                                errTip = "客户端认证授权失败。请重试或提交反馈。";
                                break;
                            case 405:
                                errTip = "客户端请求错误。请重试或提交反馈。";
                                break;
                            case 579:
                                errTip = "资源上传成功，但回调失败。";
                                break;
                            case 599:
                                errTip = "网络连接异常。请重试或提交反馈。";
                                break;
                            case 614:
                                errTip = "文件已存在。";
                                break;
                            case 631:
                                errTip = "指定空间不存在。";
                                break;
                            case 701:
                                errTip = "上传数据块校验出错。请重试或提交反馈。";
                                break;
                            default:
                                errTip = "未知错误。";
                                break;
                        }
                        var errorObj = parseJSON(err.response);
                        errTip = errTip + '(' + err.status + '：' + errorObj.error + ')';
                        break;
                    case plupload.SECURITY_ERROR:
                        errTip = '安全配置错误。请联系网站管理员。';
                        break;
                    case plupload.GENERIC_ERROR:
                        errTip = '上传失败。请稍后再试。';
                        break;
                    case plupload.IO_ERROR:
                        errTip = '上传失败。请稍后再试。';
                        break;
                    case plupload.INIT_ERROR:
                        errTip = '网站配置错误。请联系网站管理员。';
                        uploader.destroy();
                        break;
                    default:
                        errTip = err.message + err.details;
                        break;
                }
                if (Error_Handler) {
                    Error_Handler(up, err, errTip);
                }
            }
            up.refresh(); // Reposition Flash/Silverlight
        }
    })(Error_Handler));



    uploader.bind('FileUploaded', (function(FileUploaded_Handler) {
        return function(up, file, info) {
            console.log(FileUploaded_Handler);
            var res = parseJSON(info.response);
            // console.log(info.response);
            // console.log(this === uploader);
            ctx = ctx ? ctx : res.ctx;
            // console.log('FileUploaded_Handler', uploader.Error_Handler);
            if (ctx) {
                var url = 'http://up.qiniu.com/mkfile/' + file.size + '/key/' + URLSafeBase64Encode(file.name);
                var ajax = createAjax();
                ajax.open('POST', url, true);
                ajax.setRequestHeader('Content-Type', 'text/plain;charset=UTF-8');
                ajax.setRequestHeader('Authorization', 'UpToken ' + token);
                ajax.send(ctx);
                ajax.onreadystatechange = function() {
                    if (ajax.readyState === 4 && ajax.status === 200) {
                        var info = ajax.responseText;
                        if (FileUploaded_Handler) {
                            // console.log('FileUploaded_Handler');
                            FileUploaded_Handler(up, file, info);
                        }
                    }
                };
            } else {
                // console.log('FileUploaded_Handler', FileUploaded_Handler);
                if (FileUploaded_Handler) {
                    FileUploaded_Handler(up, file, info.response);
                }
            }

        };
    })(FileUploaded_Handler));

    return this;
}
