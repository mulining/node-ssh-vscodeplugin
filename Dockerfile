# 构建容器镜像（Dockerfile 内容）
FROM ubuntu:latest
RUN apt -y update && apt -y install openssh-server
RUN mkdir /var/run/sshd
RUN echo 'root:your_password' | chpasswd
RUN sed -i 's/PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config
EXPOSE 22
CMD ["/usr/sbin/sshd", "-D"]