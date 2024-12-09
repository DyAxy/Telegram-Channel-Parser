#!/bin/bash

message_db="./server/database/message.db*"
session_dir="./server/.session"
delete_message=false
delete_session=false

show_help() {
    echo "用法: $0 [-M|--message] [-S|--session]"
    echo "选项:"
    echo "  -M, --message    删除消息缓存"
    echo "  -S, --session    删除会话缓存"
    echo "  -h, --help       显示帮助信息"
    echo "可同时使用多个选项，如: $0 -M -S"
}

if [ $# -eq 0 ]; then
    show_help
    exit 1
fi

while [ "$1" != "" ]; do
    case $1 in
        -M | --message )    
            delete_message=true
            ;;
        -S | --session )    
            delete_session=true
            ;;
        -h | --help )       
            show_help
            exit
            ;;
        * )                 
            echo "未知选项: $1"
            show_help
            exit 1
    esac
    shift
done

if [ "$delete_message" = true ]; then
    echo "正在删除消息缓存..."
    rm -f "$message_db"
    [ $? -eq 0 ] && echo "消息缓存已删除" || echo "删除消息缓存失败"
fi

if [ "$delete_session" = true ]; then
    echo "正在删除会话缓存..."
    rm -rf "$session_dir"
    [ $? -eq 0 ] && echo "会话缓存已删除" || echo "删除会话缓存失败"
fi

if [ "$delete_message" = false ] && [ "$delete_session" = false ]; then
    show_help
    exit 1
fi